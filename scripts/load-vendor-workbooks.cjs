// scripts/load-vendor-workbooks.cjs — ลงทะเบียนเครื่องและยอดมิเตอร์จากรายงานของผู้ให้เช่า
//
//   node scripts/load-vendor-workbooks.cjs <config.json> --confirm
//
// ใช้ตั้งฐานข้อมูลใหม่จากไฟล์จริงของผู้ให้เช่าครั้งแรก (ADR-0023) ทุกการอ่านและเขียน
// ผ่าน HTTP API เดิม — ไม่ต่อ MySQL ตรง (AGENTS.md) กฎสิทธิ์และการตรวจข้อมูลจึงเป็น
// ชุดเดียวกับที่หน้าเว็บใช้ และยอดมิเตอร์เข้าทางหน้านำเข้าตัวเดียวกับที่เจ้าหน้าที่ใช้
// ทุกเดือน ถ้าไฟล์จริงผ่านสคริปต์นี้ได้ ก็ผ่านหน้าเว็บได้
//
// ## config.json
//
//   {
//     "api": "http://localhost:3002/api",
//     "fiscalYears": ["2568", "2569", "2570"],
//     "categoryByModel": [{ "pattern": "HL-L5210DN|ES5112", "category": "a4-laser-bw" }, ...],
//     "contracts": [{
//       "contract_no": "SUTH192/2568", "effective_from": "2026-02-24", "effective_to": "2029-02-23",
//       "monthly_rental": null, "vat_rate": null,
//       "price_lines": [{ "category": "a4-laser-bw", "price_per_page": "0.365" }, ...],
//       "workbook": "docs/6-Meter SUTH192-2568-Aug-69.xlsx"
//     }]
//   }
//
// บัญชีผู้ดูแลอ่านจาก SUTH_ADMIN_USER / SUTH_ADMIN_PASSWORD — ไม่เก็บในไฟล์
//
// ## สิ่งที่สคริปต์ตัดสินแทนคน และเหตุผล
//
//   - หมวดมิเตอร์มาจากรุ่นเครื่อง (categoryByModel) รุ่นที่ไม่มีในรายการทำให้หยุดทั้งหมด
//     หน้านำเข้าตรวจซ้ำอีกชั้นว่าราคาในไฟล์เท่าราคาในระบบทุกแถว
//   - ที่ตั้งและหน่วยงานเป็นของแผ่นล่าสุดที่เครื่องปรากฏ — API ย้ายเครื่องมีผลวันนี้เท่านั้น
//     ยอดของเดือนก่อนหน้าจึงนับตามที่ตั้งล่าสุด ยอดรวมรายสัญญาและรายเดือนไม่กระทบ
//   - เครื่องที่ไม่มีเลขสิ้นงวดเลยสักแผ่น (รอติดตั้ง เครื่องสำรอง) = ยังไม่ได้ติดตั้ง
//   - วันเริ่มติดตั้ง: เครื่องที่มียอดตั้งแต่แผ่นแรกของไฟล์ใช้วันเริ่มสัญญา เครื่องที่เริ่ม
//     มียอดทีหลังใช้วันเริ่มงวดแรกที่ผู้ให้เช่าเรียกเก็บ ทั้งสองค่ามาจากเอกสารของผู้ให้เช่า

const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const [configPath] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!configPath || !process.argv.includes("--confirm")) {
  fail("ใช้: node scripts/load-vendor-workbooks.cjs <config.json> --confirm");
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const { SUTH_ADMIN_USER, SUTH_ADMIN_PASSWORD } = process.env;
if (!SUTH_ADMIN_USER || !SUTH_ADMIN_PASSWORD) fail("ตั้ง SUTH_ADMIN_USER และ SUTH_ADMIN_PASSWORD ก่อน");

let cookie = "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, route, body, { form } = {}, attempt = 1) {
  const response = await fetch(`${config.api}${route}`, {
    method,
    headers: { cookie, ...(form ? {} : { "content-type": "application/json" }) },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  // API จำกัดความถี่คำขอ — รอตามที่เซิร์ฟเวอร์บอกแล้วลองใหม่ ไม่ข้ามเครื่องไหน
  if (response.status === 429 && attempt <= 20) {
    const wait = Number(response.headers.get("retry-after")) || 15;
    await sleep(wait * 1000);
    return api(method, route, body, { form }, attempt + 1);
  }
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.errors ? `\n${JSON.stringify(data.errors.slice(0, 20), null, 2)}` : "";
    throw new Error(`${method} ${route} → ${response.status} ${data?.title ?? text}${detail}`);
  }
  return data;
}

// ------------------------------------------------------------------------------
// อ่านไฟล์ของผู้ให้เช่า
// ------------------------------------------------------------------------------

const { parseVendorWorkbook } = require(path.join(ROOT, "apps/api/src/import/vendor-meter"));

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const header = (cell) => clean(cell).toLowerCase();

/** ข้อมูลทะเบียนของทุกเครื่องในไฟล์ จากแผ่นล่าสุดที่เครื่องปรากฏ */
function readRegister(workbookPath) {
  const workbook = XLSX.readFile(path.resolve(ROOT, workbookPath));
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true }),
  }));
  const parsed = parseVendorWorkbook(sheets);
  if (!parsed || parsed.errors.length) {
    fail(`อ่าน ${workbookPath} ไม่ผ่าน: ${JSON.stringify(parsed?.errors?.slice(0, 5))}`);
  }

  const devices = new Map();
  parsed.sheets.forEach((info, order) => {
    const rows = sheets.find((sheet) => sheet.name.trim() === info.sheet).rows;
    const headerRow = rows.findIndex((row) => row.some((cell) => header(cell).startsWith("meter start")));
    const cols = rows[headerRow].map(header);
    const col = (...names) => cols.findIndex((cell) => names.includes(cell));
    const at = {
      serial: col("sn.", "sn", "serial number"),
      model: col("model"),
      printer: col("printer name"),
      division: col("division"),
      department: col("department"),
      building: col("building"),
      floor: col("fool.", "floor"),
    };

    const seen = new Set();
    for (const row of rows.slice(headerRow + 1)) {
      const serial = clean(row[at.serial]);
      if (!serial || seen.has(serial.toUpperCase())) continue; // แถวที่สองของเลขเดียวกัน = มิเตอร์สี
      seen.add(serial.toUpperCase());

      const previous = devices.get(serial.toUpperCase());
      devices.set(serial.toUpperCase(), {
        serial_number: serial,
        model: clean(row[at.model]),
        location: clean(row[at.printer]).slice(0, 255),
        division: at.division === -1 ? "" : clean(row[at.division]),
        department: at.department === -1 ? "" : clean(row[at.department]),
        building: at.building === -1 ? "" : clean(row[at.building]),
        floor: at.floor === -1 ? "" : clean(row[at.floor]),
        first_reading_sheet: previous?.first_reading_sheet ?? null,
        has_color_meter: previous?.has_color_meter ?? false,
        order,
      });
    }
  });

  for (const reading of parsed.readings) {
    const device = devices.get(reading.serial_number.toUpperCase());
    if (reading.meter === "color") device.has_color_meter = true;
    const order = parsed.sheets.findIndex((s) => s.sheet === reading.sheet);
    if (device.first_reading_sheet === null || order < device.first_reading_sheet) {
      device.first_reading_sheet = order;
    }
  }

  return { devices: [...devices.values()], sheets: parsed.sheets, readings: parsed.readings };
}

// ------------------------------------------------------------------------------
// ข้อมูลหลัก
// ------------------------------------------------------------------------------

async function ensureLookup(route, name, extra = {}, cache) {
  const key = `${route}|${extra.building_id ?? extra.division_id ?? ""}|${name}`;
  if (cache.has(key)) return cache.get(key);
  const existing = (await api("GET", route)).find(
    (row) =>
      row.name === name &&
      (extra.building_id === undefined || row.building_id === extra.building_id) &&
      (extra.division_id === undefined || row.division_id === extra.division_id)
  );
  const id = existing?.id ?? (await api("POST", route, { name, ...extra })).id;
  cache.set(key, id);
  return id;
}

function brandAndModel(text) {
  const match = text.match(/^(Brother|HP|OKI)[\s-]+(.*)$/i);
  if (!match) fail(`แยกยี่ห้อจากรุ่น "${text}" ไม่ได้`);
  const brand = { brother: "Brother", hp: "HP", oki: "OKI" }[match[1].toLowerCase()];
  return { brand, model: match[2].trim() };
}

async function main() {
  await api("POST", "/auth/login", { username: SUTH_ADMIN_USER, password: SUTH_ADMIN_PASSWORD });
  console.log(`เชื่อม ${config.api} แล้ว`);

  const years = (await api("GET", "/fiscal-years")).map((row) => row.year);
  for (const year of config.fiscalYears) {
    if (!years.includes(year)) await api("POST", "/fiscal-years", { year });
  }

  const categories = await api("GET", "/contracts/meter-categories");
  const categoryId = (code) => {
    const found = categories.find((c) => c.code === code);
    if (!found) fail(`ไม่มีหมวดมิเตอร์ "${code}"`);
    return found.id;
  };
  const categoryForModel = (model) => {
    const rule = config.categoryByModel.find((r) => new RegExp(r.pattern, "i").test(model));
    if (!rule) fail(`ไม่รู้ว่ารุ่น "${model}" อยู่หมวดไหน — เพิ่มใน categoryByModel`);
    return categoryId(rule.category);
  };

  const lookups = new Map();
  const existingDevices = new Set((await api("GET", "/devices")).map((d) => d.serial_number.toUpperCase()));

  for (const contract of config.contracts) {
    const register = readRegister(contract.workbook);
    console.log(`\n${contract.contract_no}: ${register.devices.length} เครื่อง ${register.sheets.length} งวด`);

    const contracts = await api("GET", "/contracts");
    let saved = contracts.find((c) => c.contract_no === contract.contract_no);
    const body = {
      contract_no: contract.contract_no,
      effective_from: contract.effective_from,
      effective_to: contract.effective_to,
      monthly_rental: contract.monthly_rental,
      vat_rate: contract.vat_rate,
      price_lines: contract.price_lines.map((line) => ({
        category_id: categoryId(line.category),
        price_per_page: line.price_per_page,
      })),
    };
    saved = saved ? await api("PUT", `/contracts/${saved.id}`, body) : await api("POST", "/contracts", body);
    console.log(`  สัญญา id ${saved.id}`);

    let created = 0;
    for (const device of register.devices) {
      if (existingDevices.has(device.serial_number.toUpperCase())) continue;

      const { brand, model } = brandAndModel(device.model);
      const building_id = device.building ? await ensureLookup("/buildings", device.building, {}, lookups) : null;
      const floor_id =
        building_id && device.floor
          ? await ensureLookup("/floors", device.floor, { building_id }, lookups)
          : null;
      const division_id = device.division ? await ensureLookup("/divisions", device.division, {}, lookups) : null;
      const department_id =
        division_id && device.department
          ? await ensureLookup("/departments", device.department, { division_id }, lookups)
          : null;

      const installed = device.first_reading_sheet !== null;
      const installedOn = !installed
        ? undefined
        : device.first_reading_sheet === 0
          ? contract.effective_from
          : register.sheets[device.first_reading_sheet].period_start;

      await api("POST", "/devices", {
        serial_number: device.serial_number,
        brand_id: await ensureLookup("/brands", brand, {}, lookups),
        model,
        building_id,
        floor_id,
        location: device.location || null,
        division_id,
        department_id,
        contract_id: saved.id,
        status: "active",
        installation_status: installed ? "installed" : "not_installed",
        installed_on: installedOn,
        billing_from: contract.effective_from,
        meter_category_id: categoryForModel(device.model),
        has_color_meter: device.has_color_meter,
      });
      existingDevices.add(device.serial_number.toUpperCase());
      created += 1;
    }
    console.log(`  ลงทะเบียนเครื่องใหม่ ${created} เครื่อง`);

    // ยอดมิเตอร์ผ่านหน้านำเข้าตัวเดียวกับที่เจ้าหน้าที่ใช้ — ตรวจก่อน แล้วยืนยัน
    const file = path.resolve(ROOT, contract.workbook);
    const upload = (mode, token) => {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
      form.append("mode", mode);
      if (token) form.append("preview_token", token);
      return api("POST", "/print-transactions/import", undefined, { form });
    };

    const preview = await upload("preview");
    if (!preview.valid) {
      fail(`ไฟล์ ${contract.workbook} ตรวจไม่ผ่าน:\n${JSON.stringify(preview.errors.slice(0, 20), null, 2)}`);
    }
    if (preview.warnings?.length) {
      console.log(`  คำเตือน ${preview.warnings.length} รายการ`);
      for (const warning of preview.warnings) console.log(`    - ${warning.serial_number} ${warning.month}: ${warning.reason}`);
    }
    const committed = await upload("commit", preview.preview_token);
    console.log(`  บันทึกยอด ${committed.rows_upserted} รายการ (ไม่เปลี่ยน ${committed.unchanged})`);

    const byMonth = new Map();
    for (const line of committed.invoice.filter((l) => l.contract_no === contract.contract_no)) {
      byMonth.set(line.month, (byMonth.get(line.month) ?? 0) + Math.round(Number(line.line_total) * 100));
      console.log(`    ${line.month} ${line.category.padEnd(24)} ${line.price_per_page} × ${line.net_pages} = ${line.line_total}`);
    }
    for (const [month, cents] of byMonth) console.log(`  ${month} ค่าพิมพ์รวม ${(cents / 100).toFixed(2)}`);
  }
}

main().catch((err) => fail(err.message));

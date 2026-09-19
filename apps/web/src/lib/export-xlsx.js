import { locale, t } from "./locale";

/**
 * export-xlsx.js — เขียนไฟล์ Excel โดย **โหลดไลบรารีตอนกดปุ่มเท่านั้น**
 *
 * ## ปัญหาที่ตัวนี้แก้
 *
 * เดิมสามไฟล์ `import * as XLSX from "xlsx"` ไว้ที่หัวไฟล์ ทำให้ก้อน xlsx
 * (~440 kB ก่อนบีบอัด) ถูกรวมเข้ากับ chunk ที่โหลดตั้งแต่เปิดเว็บ ทั้งที่ผู้ใช้
 * ส่วนใหญ่ในแต่ละครั้งที่เปิดไม่ได้กดส่งออกเลย
 *
 * `await import()` ทำให้ Vite แยกก้อนนี้ออกไปเป็น chunk ของตัวเอง แล้วดึงมา
 * ตอนกดปุ่มครั้งแรก — ครั้งต่อไปเบราว์เซอร์มีอยู่แล้วไม่ต้องโหลดซ้ำ
 *
 * **ไม่ได้ลดความสามารถของผู้ใช้แม้แต่นิดเดียว** การส่งออกเป็นงานหลักของหน้าค่าใช้จ่าย
 *
 * ## ทำไมต้องรวมมาไว้ที่เดียว
 *
 * นอกจากลดโค้ดซ้ำสามที่แล้ว ยังกันไม่ให้ใครเผลอ `import "xlsx"` ที่หัวไฟล์อีก
 * ซึ่งจะดึงก้อนใหญ่กลับเข้า chunk เริ่มต้นโดยไม่มีใครสังเกต
 *
 * ## กราฟ ตรึงหัวตาราง และรูปแบบตัวเลข
 *
 * SheetJS รุ่นที่ใช้ (ADR-0003) เขียนตัวเลข รูปแบบตัวเลข และตัวกรองได้ แต่เขียนกราฟ
 * กับการตรึงแถวไม่ได้ จึงเติมส่วนนั้นลงในแพ็กเกจ .xlsx ที่ได้ด้วย fflate หลังเขียน
 * เสร็จ กราฟเป็นกราฟมาตรฐานของ Excel ที่อ้างอิงเซลล์ในตาราง (ไม่ใช่รูปภาพ) คนเปิด
 * ไฟล์จึงแก้สี ชนิด หรือช่วงข้อมูลต่อได้เอง และกราฟขยับตามตัวกรองของตาราง
 */

const SHEET_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
// SheetJS สร้างแผ่นงานเหล่านี้โดยไม่มี relationship ของตัวเอง เลขสูงที่ตั้งชื่อไว้
// จึงไม่ชนกับ relationship ที่ SheetJS อาจเพิ่มในอนาคต ส่วนเลขแกนแค่ต้องไม่ซ้ำกัน
// ภายในกราฟเดียว
const DRAWING_RELATIONSHIP_ID = "rId999";
const CATEGORY_AXIS_ID = 48650112;
const VALUE_AXIS_ID = 48672768;
/** ความยาวชื่อแผ่นงานสูงสุดที่ Excel ยอมรับ */
const MAX_SHEET_NAME = 31;
/** วันที่ 0 ของ Excel (ระบบ 1900) — แปลงเดือนเป็นวันที่จริงโดยไม่ผ่าน timezone ของเครื่อง */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

/** รูปแบบตัวเลขที่ใช้ร่วมกันทุกไฟล์ */
export const FORMATS = {
  count: "#,##0",
  pages: "#,##0.00",
  baht: "#,##0.00",
  price: "#,##0.0000",
  percent: "0.0%",
  month: "yyyy-mm",
};

/**
 * แปลงเดือน "YYYY-MM" เป็นเลขวันที่ของ Excel (วันที่ 1 ของเดือน)
 *
 * ไฟล์ได้วันที่จริงที่เรียง กรอง และทำ PivotTable ตามเดือนได้ แทนข้อความที่ Excel
 * อาจตีความใหม่เองตอนเปิด ค่าที่ไม่ใช่เดือนคืน null (เซลล์ว่าง) ไม่ใช่วันที่ผิด
 */
export function monthCell(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ""));
  if (!match) return null;
  return (Date.UTC(Number(match[1]), Number(match[2]) - 1, 1) - EXCEL_EPOCH_UTC) / DAY_MS;
}

/**
 * สร้างไฟล์ .xlsx หลายแผ่นงาน
 *
 * @param {object} spec
 * @param {Array<object>} spec.sheets แผ่นงานตามลำดับ
 * @param {string} spec.sheets[].name ชื่อแผ่นงาน
 * @param {string[]} [spec.sheets[].header] แถวหัวตาราง ไม่ใส่ = ไม่มีหัว (ไม่ตรึง ไม่กรอง)
 * @param {Array<Array<string|number|null>>} spec.sheets[].rows แถวข้อมูล — null = เซลล์ว่าง
 * @param {Array<{format?: string, text?: boolean, width?: number}>} [spec.sheets[].columns]
 *   รูปแบบของแต่ละคอลัมน์ `format` ใช้กับเซลล์ตัวเลข `text` บอกว่าเป็นรหัสที่ต้องคง
 *   ตัวอักษรเดิม (เช่น Serial ที่ขึ้นต้นด้วยศูนย์) ไม่ระบุความกว้าง = คำนวณจากข้อความจริง
 * @param {boolean} [spec.sheets[].filter=true] เปิดตัวกรองที่หัวตาราง
 * @param {object} [spec.sheets[].chart] กราฟของแผ่นนี้ ดู chartXml
 * @param {object[]} [spec.sheets[].charts] หลายกราฟในแผ่นเดียว เรียงลงมาใต้ตารางตามลำดับ
 * @returns {Promise<Uint8Array>}
 */
export async function createWorkbook({ sheets }) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const used = new Set();

  const prepared = sheets.map((sheet) => {
    const name = uniqueSheetName(sheet.name, used);
    const header = sheet.header ?? null;
    const aoa = header ? [header, ...sheet.rows] : sheet.rows;
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const columns = sheet.columns ?? [];
    const offset = header ? 1 : 0;

    columns.forEach((column, index) => {
      for (let row = offset; row < aoa.length; row += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: index })];
        if (!cell) continue;
        if (column.text) {
          cell.t = "s";
          cell.v = String(cell.v);
        } else if (column.format && cell.t === "n") {
          cell.z = column.format;
        }
      }
    });

    const width = Math.max(header?.length ?? 0, ...sheet.rows.map((row) => row.length));
    worksheet["!cols"] = autoWidths(header, sheet.rows, columns, width).map((wch) => ({ wch }));
    if (header && sheet.filter !== false && width > 0) {
      worksheet["!autofilter"] = { ref: `A1:${columnLetter(width)}${sheet.rows.length + 1}` };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, name);
    return { ...sheet, name, header, width, rowCount: sheet.rows.length, aoa };
  });

  const bytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));
  return enhanceWorkbook(bytes, prepared);
}

/**
 * บรรทัดบริบทมาตรฐานที่ทุกไฟล์มีเหมือนกัน — ชื่อรายงาน เวลาที่สร้าง และสกุลเงิน
 *
 * เวลาใช้ Asia/Bangkok ตายตัว ไม่ใช่เวลาของเครื่องที่เปิด เพราะไฟล์เดินทางต่อได้
 */
export function reportStamp(filename, now = new Date()) {
  const en = locale.value === "en";
  return [
    [t("รายงาน"), filename],
    [t("สร้างเมื่อ (Asia/Bangkok)"), new Intl.DateTimeFormat(en ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(now)],
    [t("สกุลเงิน"), "THB"],
  ];
}

/**
 * สร้างและดาวน์โหลดไฟล์ .xlsx หนึ่งแผ่นงานพร้อมแผ่นบริบท — รูปแบบเดิมของตารางทั่วระบบ
 *
 * @param {object} spec
 * @param {string[]} spec.header แถวหัวตาราง
 * @param {(string|number)[][]} spec.rows แถวข้อมูล
 * @param {string} spec.sheetName ชื่อแผ่นงานในไฟล์
 * @param {string} spec.filename ชื่อไฟล์ **ไม่ต้องใส่ .xlsx**
 * @param {number[]} [spec.columnWidths] ความกว้างคอลัมน์ (หน่วยตัวอักษร)
 *   ไม่ระบุ = คำนวณจากความยาวข้อความจริง ไม่งั้นเปิดไฟล์มาเจอ ##### ทุกช่อง
 */
export async function createWorkbookBytes({ header, rows, sheetName, filename, columnWidths, context = [] }) {
  return createWorkbook({
    sheets: [
      { name: sheetName, header, rows, columns: columnWidths?.map((width) => ({ width })) },
      { name: t("บริบทรายงาน"), rows: [...reportStamp(filename), ...context] },
    ],
  });
}

export async function exportSheet(spec) {
  downloadWorkbook(await createWorkbookBytes(spec), spec.filename);
}

/** ส่งไฟล์ที่สร้างแล้วให้เบราว์เซอร์ดาวน์โหลด */
export function downloadWorkbook(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

/** ความกว้างที่พอดีกับข้อความที่ยาวที่สุดของแต่ละคอลัมน์ จำกัดไม่ให้แคบหรือกว้างเกินไป */
function autoWidths(header, rows, columns, width) {
  return Array.from({ length: width }, (_, index) => {
    if (columns[index]?.width) return columns[index].width;
    const cells = [header?.[index], ...rows.map((row) => row[index])];
    const longest = Math.max(0, ...cells.map((cell) => displayLength(cell, columns[index]?.format)));
    return Math.min(Math.max(longest + 2, 8), 48);
  });
}

/** ความยาวที่ Excel จะแสดงจริง — ตัวเลขมีตัวคั่นหลักพันและทศนิยมตามรูปแบบ */
function displayLength(value, format) {
  if (value === null || value === undefined) return 0;
  if (typeof value !== "number") return String(value).length;
  if (format === FORMATS.month) return 7;
  if (format === FORMATS.percent) return 7;
  const digits = format?.includes(".") ? format.split(".")[1].length : 0;
  return Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).length + 1;
}

function uniqueSheetName(name, used) {
  const base = String(name || "Sheet").replace(/[[\]:*?/\\]/g, " ").slice(0, MAX_SHEET_NAME) || "Sheet";
  let candidate = base;
  for (let index = 2; used.has(candidate); index += 1) {
    const suffix = ` (${index})`;
    candidate = `${base.slice(0, MAX_SHEET_NAME - suffix.length)}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

export function columnLetter(count) {
  let value = Math.max(1, Number(count));
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function freezeHeader(xml) {
  if (xml.includes("<pane ")) return xml;
  return xml.replace(
    /<sheetView([^>]*)\/>/,
    '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>'
  );
}

async function enhanceWorkbook(bytes, sheets) {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import("fflate");
  const files = unzipSync(bytes);
  const read = (path) => strFromU8(files[path]);
  const write = (path, value) => { files[path] = strToU8(value); };
  const overrides = [];
  let drawingNumber = 0;
  let chartNumber = 0;

  sheets.forEach((sheet, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    let xml = read(path);
    if (sheet.header) xml = freezeHeader(xml);

    const charts = sheet.charts ?? (sheet.chart ? [sheet.chart] : []);
    if (charts.length && sheet.rowCount > 0) {
      drawingNumber += 1;
      const numbers = charts.map(() => (chartNumber += 1));
      if (!xml.includes("xmlns:r=")) {
        xml = xml.replace("<worksheet ", `<worksheet xmlns:r="${SHEET_REL_TYPE}" `);
      }
      xml = xml.replace("</worksheet>", `<drawing r:id="${DRAWING_RELATIONSHIP_ID}"/></worksheet>`);
      write(`xl/worksheets/_rels/sheet${index + 1}.xml.rels`, sheetRelationships(drawingNumber));
      write(`xl/drawings/drawing${drawingNumber}.xml`, drawingXml(sheet, charts, numbers));
      write(`xl/drawings/_rels/drawing${drawingNumber}.xml.rels`, drawingRelationships(numbers));
      overrides.push(`<Override PartName="/xl/drawings/drawing${drawingNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      charts.forEach((chart, position) => {
        write(`xl/charts/chart${numbers[position]}.xml`, chartXml(sheet, chart));
        overrides.push(`<Override PartName="/xl/charts/chart${numbers[position]}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      });
    }
    write(path, xml);
  });

  if (overrides.length) {
    write("[Content_Types].xml", read("[Content_Types].xml").replace("</Types>", `${overrides.join("")}</Types>`));
  }
  return zipSync(files, { level: 6 });
}

function sheetRelationships(number) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="${DRAWING_RELATIONSHIP_ID}" Type="${SHEET_REL_TYPE}/drawing" Target="../drawings/drawing${number}.xml"/>`
    + "</Relationships>";
}

function drawingRelationships(numbers) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + numbers.map((number, position) => `<Relationship Id="rId${position + 1}" Type="${SHEET_REL_TYPE}/chart" Target="../charts/chart${number}.xml"/>`).join("")
    + "</Relationships>";
}

/** 1 ซม. ในหน่วย EMU ของ DrawingML */
const EMU_PER_CM = 360000;
/** ความสูงแถวปกติของ Excel (15pt) เป็นเซนติเมตร — ใช้หาแถวที่กราฟถัดไปเริ่ม */
const ROW_CM = 0.53;

/**
 * วางกราฟใต้ตาราง เว้นหนึ่งแถว ขนาดตายตัวเป็นเซนติเมตร
 *
 * วางใต้ตาราง เพราะตารางที่มีคอลัมน์รายเดือนกว้างเกินจอ การวางข้างขวาทำให้กราฟหลุด
 * จากจอตอนเปิดไฟล์ ส่วนขนาดตายตัว (oneCellAnchor) เพราะถ้ายึดตามขอบคอลัมน์ กราฟจะกว้าง
 * ตามหัวตารางที่ยาว จนได้กราฟแบนยาวหลายเมตรที่อ่านไม่ได้ แท่งแนวนอนสูงตามจำนวนหมวด
 * หลายกราฟเรียงต่อกันลงมา แต่ละใบเริ่มที่แถวถัดจากใบก่อน
 */
function drawingXml(sheet, charts, numbers) {
  let fromRow = sheet.rowCount + (sheet.header ? 1 : 0) + 1;
  const anchors = charts.map((chart, position) => {
    const { type = "bar", series = [] } = chart;
    const categories = chart.categoryCount ?? sheet.rowCount;
    const bars = type === "bar" ? categories * Math.max(1, series.length) : 0;
    const heightCm = Math.max(9, Math.min(24, 3.5 + bars * 0.9));
    const anchor = `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
      + `<xdr:ext cx="${18 * EMU_PER_CM}" cy="${Math.round(heightCm * EMU_PER_CM)}"/>`
      + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${numbers[position] + 1}" name="${escapeXml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${position + 1}"/></a:graphicData></a:graphic>`
      + "</xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>";
    fromRow += Math.ceil(heightCm / ROW_CM) + 1;
    return anchor;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + anchors.join("")
    + "</xdr:wsDr>";
}

/** "'ชื่อแผ่น'!$B$2:$B$6" จากพิกัดเริ่มจากศูนย์ (รวมแถวหัว) */
function rangeRef(sheetName, { c1, r1, c2 = c1, r2 = r1 }) {
  const safe = String(sheetName).replaceAll("'", "''");
  return `'${safe}'!$${columnLetter(c1 + 1)}$${r1 + 1}:$${columnLetter(c2 + 1)}$${r2 + 1}`;
}

function cellsOf(aoa, { c1, r1, c2 = c1, r2 = r1 }) {
  const cells = [];
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) cells.push(aoa[r]?.[c] ?? null);
  }
  return cells;
}

function strCache(values) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values
    .map((value, index) => (value === null || value === undefined ? "" : `<c:pt idx="${index}"><c:v>${escapeXml(value)}</c:v></c:pt>`))
    .join("")}</c:strCache>`;
}

function numCache(values, format) {
  return `<c:numCache><c:formatCode>${escapeXml(format || "General")}</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((value, index) => (typeof value === "number" && Number.isFinite(value) ? `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>` : ""))
    .join("")}</c:numCache>`;
}

function richText(text) {
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="th-TH" sz="1200" b="1"/><a:t>${escapeXml(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

/**
 * กราฟมาตรฐานของ Excel ที่อ้างอิงเซลล์ในแผ่นงาน
 *
 * `chart.type`  "bar" (แท่งแนวนอน) | "column" (แท่งตั้ง) | "line"
 * `chart.series` [{ name: {c1,r1}, categories: {c1,r1,c2,r2}, values: {c1,r1,c2,r2} }]
 *                พิกัดเริ่มจากศูนย์และนับแถวหัวด้วย
 *
 * แนบค่าที่คำนวณแล้ว (cache) ไว้ด้วย โปรแกรมดูตัวอย่างไฟล์ที่ไม่คำนวณสูตรเองจึงยังเห็นกราฟ
 * ส่วน Excel อ่านค่าจากเซลล์จริงทุกครั้งที่เปิด
 */
export function chartXml(sheet, chart = sheet.chart) {
  const { type = "bar", title, series, valueFormat = "General", valueTitle = "" } = chart;
  const horizontal = type === "bar";
  const line = type === "line";
  const seriesXml = series.map((item, index) => {
    const name = cellsOf(sheet.aoa, item.name)[0];
    const categories = cellsOf(sheet.aoa, item.categories).map((value) => (value === null ? null : String(value)));
    const values = cellsOf(sheet.aoa, item.values);
    const common = `<c:idx val="${index}"/><c:order val="${index}"/>`
      + `<c:tx><c:strRef><c:f>${escapeXml(rangeRef(sheet.name, item.name))}</c:f>${strCache([name])}</c:strRef></c:tx>`;
    const data = `<c:cat><c:strRef><c:f>${escapeXml(rangeRef(sheet.name, item.categories))}</c:f>${strCache(categories)}</c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>${escapeXml(rangeRef(sheet.name, item.values))}</c:f>${numCache(values, valueFormat)}</c:numRef></c:val>`;
    return line
      ? `<c:ser>${common}<c:spPr><a:ln w="22225" cap="rnd"><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>${data}<c:smooth val="0"/></c:ser>`
      : `<c:ser>${common}<c:invertIfNegative val="0"/>${data}</c:ser>`;
  }).join("");

  const plot = line
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesXml}<c:marker val="1"/><c:axId val="${CATEGORY_AXIS_ID}"/><c:axId val="${VALUE_AXIS_ID}"/></c:lineChart>`
    : `<c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${seriesXml}<c:gapWidth val="60"/><c:axId val="${CATEGORY_AXIS_ID}"/><c:axId val="${VALUE_AXIS_ID}"/></c:barChart>`;

  // แท่งแนวนอนเรียงจากบนลงล่างตามแถวของตาราง (อันดับ 1 อยู่บนสุด) แกนค่าจึงต้อง
  // ย้ายไปตัดที่หมวดสุดท้าย ไม่งั้นตัวเลขของแกนจะไปอยู่ขอบบนของกราฟ
  const categoryAxis = `<c:catAx><c:axId val="${CATEGORY_AXIS_ID}"/><c:scaling><c:orientation val="${horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${VALUE_AXIS_ID}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valueAxis = `<c:valAx><c:axId val="${VALUE_AXIS_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "b" : "l"}"/><c:majorGridlines/>`
    + (valueTitle ? `<c:title>${richText(valueTitle).replace('sz="1200" b="1"', 'sz="1000" b="0"')}<c:overlay val="0"/></c:title>` : "")
    + `<c:numFmt formatCode="${escapeXml(valueFormat)}" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${CATEGORY_AXIS_ID}"/><c:crosses val="${horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;
  const legend = series.length > 1 ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : "";

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:roundedCorners val="0"/><c:chart>'
    + `<c:title>${richText(title)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    + `<c:plotArea><c:layout/>${plot}${categoryAxis}${valueAxis}</c:plotArea>`
    + `${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

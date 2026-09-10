// Deterministic HTTP boundary: never writes the development database.
export async function assetFixture(page, role = "admin") {
  const state = {
    rows: Array.from({ length: 45 }, (_, i) => ({
      id: i + 1, serial_number: `SUTH-${String(i + 1).padStart(3, "0")}`,
      asset_code: `IT-${i + 1}`, brand_id: 1, brand_name: "SUTH Printer",
      model: "Office 400", building_id: 1, building_name: "อาคารผู้ป่วยนอก",
      floor_id: 1, floor_name: "ชั้น 2", location: "เคาน์เตอร์พยาบาล",
      division_id: 1, division_name: "ฝ่ายการพยาบาล",
      department_id: 1, department_name: "หน่วยบริการผู้ป่วยนอกและประสานงานการรักษาต่อเนื่อง",
      contract_id: 1, contract_no: "SUTH-2569", fiscal_year: 2569,
      price_per_page: 0.45, price_override: null, status: "active",
    })),
    failSave: false, failList: false, failOptions: false, delay: 0, writes: [],
  };
  const masters = {
    brands: [{ id: 1, name: "SUTH Printer" }],
    buildings: [{ id: 1, name: "อาคารผู้ป่วยนอก" }, { id: 2, name: "อาคารใหม่" }],
    floors: [{ id: 1, name: "ชั้น 2", building_id: 1 }],
    divisions: [{ id: 1, name: "ฝ่ายการพยาบาล" }],
    departments: [{ id: 1, name: "หน่วยบริการผู้ป่วยนอกและประสานงานการรักษาต่อเนื่อง", division_id: 1 }],
    contracts: [{ id: 1, contract_no: "SUTH-2569", fiscal_year: 2569, price_per_page: 0.45 }],
    "fiscal-years": [{ id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" }],
  };
  await page.route(/\/api\/[^/]+(?:\/.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const key = url.pathname.replace(/^\/api\//, "");
    const method = route.request().method();
    const json = (data, status = 200) => route.fulfill({ status, json: data });
    if (key === "auth/me") return json({ user: { id: 1, username: role, role } });
    if (key === "devices") return state.failList ? json({ title: "Unavailable" }, 503) : json(state.rows);
    if (masters[key]) return state.failOptions && key === "buildings" ? json({}, 503) : json(masters[key]);
    const match = key.match(/^devices\/(\d+)(?:\/(move|history|current-usage))?$/);
    if (match) {
      const row = state.rows.find((item) => item.id === Number(match[1]));
      if (method === "PUT") {
        state.writes.push({ path: key, body: route.request().postDataJSON() });
        if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
        if (state.failSave) return json({ title: "บันทึกไม่สำเร็จ", code: "internal_error" }, 500);
        Object.assign(row, route.request().postDataJSON());
        if (match[2] === "move") row.building_name = masters.buildings.find((b) => b.id === row.building_id)?.name;
        return json({ success: true });
      }
      if (match[2] === "history") return json({ history: [] });
      if (match[2] === "current-usage") return json({ usage: { ...row, total_pages: 1200, total_cost: 540 } });
      return json(row);
    }
    return json([]);
  });
  return state;
}

import { assetFixture } from "./asset-fixture.js";

// All requests remain in the browser fixture; no business data reaches a database.
export async function prototypeFixture(page, role = "staff") {
  const assets = await assetFixture(page, role);
  // byDepartment: ให้เทสส่งข้อมูลแท็บฝ่าย/แผนกของตัวเองได้ (null = ชุดตั้งต้นด้านล่าง)
  const state = { coverageDelay: 0, failCoverage: false, failMonth: false, failExpense: false, failAnnual: false, failSave: false, failUnassigned: false, failMonths: false, expenseTotal: 360, expenseDelay: 0, unassigned: [], byDepartment: null, writes: [] };
  await page.route(/\/api\/(print-transactions|expense|dashboard)\b/, async (route) => {
    const url = new URL(route.request().url());
    const key = url.pathname.replace("/api/", "");
    const json = (data, status = 200) => route.fulfill({ status, json: data });
    if (key === "print-transactions/coverage") {
      if (state.failCoverage) return json({}, 503);
      if (state.coverageDelay) await new Promise(resolve => setTimeout(resolve, state.coverageDelay));
      return json({ next_incomplete_month: "2026-08", months: [{ month: "2026-08", in_progress: false }] });
    }
    if (key === "print-transactions/summary") return json([{ device_id: 1, filled: 1, total_pages: 100, latest_month: "2026-08", latest_pages: 100 }]);
    if (key === "print-transactions/bulk" || key === "print-transactions/bulk-device") {
      state.writes.push(route.request().postDataJSON());
      return state.failSave ? json({ title: "Unavailable" }, 503) : json({ success: true });
    }
    if (key.startsWith("print-transactions/by-device/")) return state.failAnnual ? json({}, 503) : json([{ month: "2026-08", pages: 100 }]);
    if (key.startsWith("print-transactions")) return state.failMonth ? json({}, 503) : json([{ device_id: 1, pages: 100 }]);
    if (key === "expense/unassigned-devices") return state.failUnassigned ? json({}, 503) : json({ devices: state.unassigned });
    if (key.startsWith("expense/") && state.expenseDelay) await new Promise(resolve => setTimeout(resolve, state.expenseDelay));
    if (key.startsWith("expense/")) return state.failExpense ? json({}, 503) : json({ contracts: [{ id: 1, contract_no: "SUTH-2569", price_per_page: 0.45, total_cost: state.expenseTotal, total_cost_satang: state.expenseTotal * 100, devices: [{ ...assets.rows[0], total_cost: 360, monthly: [{ month: "2026-09", pages: 1000, cost: 360 }] }] }] });
    if (key === "dashboard/by-department") return state.failExpense ? json({}, 503) : json(state.byDepartment ?? { divisions: [{ id: 1, name: "ฝ่ายการพยาบาล", total_cost: state.expenseTotal, total_cost_satang: state.expenseTotal * 100, total_pages: 800, departments: [{ id: 1, name: "หน่วยบริการผู้ป่วยนอก", total_cost: 360, total_pages: 800, devices: [{ ...assets.rows[0], total_cost: 360, total_pages: 800, monthly: [{ month: "2026-09", net_pages: 800, total_cost: 360 }] }] }] }], unassignedDevices: [] });
    if (key === "dashboard/monthly-kpi") return state.failMonths ? json({}, 503) : json([{ month: "2026-09", total_pages: 800, total_cost: 360 }]);
    return json([]);
  });
  return state;
}

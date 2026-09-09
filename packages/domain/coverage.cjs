"use strict";

function computeCoverage({ fyMonths, filledByMonth, activeDevices, today }) {
  const elapsedMonths = fyMonths.filter((month) => month < today);

  // ไม่มีเครื่องที่ใช้งานอยู่เลย = ไม่มีอะไรให้กรอก จึงไม่ถือว่าเดือนไหน "ค้าง"
  // ถ้าไม่กันไว้ ทุกเดือนจะเข้าเงื่อนไข 0 < 0 เป็นเท็จพอดี แต่พอ activeDevices
  // เป็น 0 การบอกว่า "กรอกครบทุกเดือน" ก็ยังเข้าใจผิดได้ จึงเขียนให้ชัด
  const incompleteMonths =
    activeDevices > 0
      ? elapsedMonths.filter((month) => (filledByMonth.get(month) || 0) < activeDevices)
      : [];

  const monthly = fyMonths.map((month) => {
    const filled = filledByMonth.get(month) || 0;
    return { month, filled_devices: filled, missing_devices: Math.max(0, activeDevices - filled),
      status: activeDevices === 0 ? "not_applicable" : filled >= activeDevices ? "complete" : month < today ? "overdue" : "not_due" };
  });
  return {
    incompleteMonths,
    coverage: {
      total_months: fyMonths.length,
      annual_complete_months: monthly.filter((m) => m.status === "complete").length,
      not_due_months: monthly.filter((m) => m.status === "not_due").length,
      applicable: activeDevices > 0,
      months: monthly,
      elapsed_months: elapsedMonths.length,
      complete_months: elapsedMonths.length - incompleteMonths.length,
      incomplete_months: incompleteMonths.length,
    },
  };
}

module.exports = { computeCoverage };

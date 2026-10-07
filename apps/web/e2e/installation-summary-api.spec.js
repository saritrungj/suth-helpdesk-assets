import { expect, test } from "@playwright/test";
import { apiFetch, reasonToSkip } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `API/database unavailable: ${skip}`);
});

const countsOf = (devices) => ({
  installed: devices.filter((device) => device.installation_status === "installed").length,
  not_installed: devices.filter((device) => device.installation_status === "not_installed").length,
  unverified: devices.filter((device) => device.installation_status === null).length,
});

test("authenticated installation summary matches current registry across lifecycle states and contract scope", async () => {
  const devices = await apiFetch("/devices");
  const summary = await apiFetch("/dashboard/installation-summary");
  expect(summary).toEqual(countsOf(devices));
  // Disposable QA seed includes installed machines under repair and retired.
  if (process.env.SUTH_E2E_DISPOSABLE_DB === "1") {
    expect(devices.some((device) => device.status === "repair" && device.installation_status === "installed")).toBe(true);
    expect(devices.some((device) => device.status === "retired" && device.installation_status === "installed")).toBe(true);
    expect(summary.unverified).toBeGreaterThan(0);
  }
  const ids = [...new Set(devices.map((device) => device.contract_id).filter(Boolean))].sort((a, b) => a - b).slice(0, 2);
  expect(ids.length).toBeGreaterThan(0);
  for (const scope of [ids.slice(0, 1), ids]) {
    const selected = devices.filter((device) => scope.includes(device.contract_id));
    expect(await apiFetch(`/dashboard/installation-summary?contract_ids=${scope.join(",")}`)).toEqual(countsOf(selected));
  }
  expect(await apiFetch("/dashboard/installation-summary?contract_ids=2147483647")).toEqual({ installed: 0, not_installed: 0, unverified: 0 });
  expect(await apiFetch("/dashboard/installation-summary?contract_ids=unassigned")).toEqual(countsOf(devices.filter((device) => device.contract_id === null)));
  expect(await apiFetch(`/dashboard/installation-summary?contract_ids=${ids[0]},unassigned`)).toEqual(countsOf(devices.filter((device) => device.contract_id === null || device.contract_id === ids[0])));
  expect(await apiFetch("/dashboard/installation-summary?month=2025-10&fiscal_year_id=1")).toEqual(summary);
});

test("installation summary rejects invalid current contract scope", async () => {
  for (const value of ["0", "1,,2", "1 OR 1=1"]) {
    await expect(apiFetch(`/dashboard/installation-summary?contract_ids=${encodeURIComponent(value)}`)).rejects.toThrow(/สถานะ 400/);
  }
});

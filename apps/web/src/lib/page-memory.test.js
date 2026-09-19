// @vitest-environment jsdom
import { beforeEach, expect, test } from "vitest";
import { installPageMemory } from "./page-memory";
import { modeMemory, writeSession } from "./session-memory";

beforeEach(() => sessionStorage.clear());

test("explicit action links win over a remembered page filter", () => {
  let guard;
  installPageMemory({ beforeEach(fn) { guard = fn; }, afterEach() {} });
  writeSession("route:Assets", { search: "old-device", building: "2" });
  const result = guard({ name: "Assets", path: "/assets", meta: {}, query: { edit: "1" } }, { name: "Dashboard" });
  expect(result).toBe(true);
});

test("malformed mode memory and inherited keys do not restore a selection", () => {
  const memory = modeMemory("dashboard");
  writeSession("modes:dashboard", null);
  expect(memory.restore("device")).toBeNull();
  writeSession("modes:dashboard", {});
  expect(memory.restore("constructor")).toBeNull();
  memory.save("device", { items: ["1"] });
  expect(memory.restore("device")).toEqual({ items: ["1"] });
});

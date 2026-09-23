import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// store อ่าน localStorage ตอน import — แต่ละเทส import ใหม่หลังตั้ง storage จำลอง
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

async function loadStore(initial) {
  const storage = fakeStorage(initial);
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  return { store: await import("./ui.js"), storage };
}

describe("หมวดเมนูเปิด-ปิดและจำค่า", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  test("ยังไม่เคยกด — ทุกหมวดเปิด", async () => {
    const { store } = await loadStore();
    for (const key of ["overview", "routine", "reports", "settings"]) expect(store.isNavGroupOpen(key)).toBe(true);
  });

  test("กดปิดแล้วจำลง localStorage และโหลดใหม่ยังปิดอยู่", async () => {
    const first = await loadStore();
    first.store.toggleNavGroup("reports");
    expect(first.store.isNavGroupOpen("reports")).toBe(false);
    expect(JSON.parse(first.storage.data.get("suth-ui-nav-groups"))).toEqual({ reports: false });

    const again = await loadStore(Object.fromEntries(first.storage.data));
    expect(again.store.isNavGroupOpen("reports")).toBe(false);
    expect(again.store.isNavGroupOpen("routine")).toBe(true);
  });

  test("กดเปิดกลับแล้วจำว่าเปิด", async () => {
    const { store, storage } = await loadStore({ "suth-ui-nav-groups": JSON.stringify({ settings: false }) });
    expect(store.isNavGroupOpen("settings")).toBe(false);
    store.toggleNavGroup("settings");
    expect(store.isNavGroupOpen("settings")).toBe(true);
    expect(JSON.parse(storage.data.get("suth-ui-nav-groups"))).toEqual({ settings: true });
  });

  test("ค่าที่เสียหรือผิดรูปถือว่ายังไม่เคยกด — ไม่ทำให้เมนูหาย", async () => {
    for (const raw of ["{not json", "[1,2]", "null", JSON.stringify({ reports: "no", routine: false })]) {
      const { store } = await loadStore({ "suth-ui-nav-groups": raw });
      expect(store.isNavGroupOpen("reports")).toBe(true);
    }
    const { store } = await loadStore({ "suth-ui-nav-groups": JSON.stringify({ reports: "no", routine: false }) });
    expect(store.isNavGroupOpen("routine")).toBe(false);
  });

  test("อ่าน/เขียน storage ไม่ได้ (โหมดส่วนตัว) — ยังเปิด-ปิดได้ในรอบนี้", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    vi.resetModules();
    const store = await import("./ui.js");
    expect(store.isNavGroupOpen("reports")).toBe(true);
    store.toggleNavGroup("reports");
    expect(store.isNavGroupOpen("reports")).toBe(false);
  });
});

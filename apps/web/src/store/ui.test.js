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

describe("ความกว้างแถบเมนูที่ลากปรับได้ (#204)", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  test("ค่าเริ่มต้น 232 และค่าที่จำไว้ถูกจำกัดในช่วงที่อนุญาต", async () => {
    expect((await loadStore()).store.uiState.navWidth).toBe(232);
    expect((await loadStore({ "suth-ui-nav-width": "999" })).store.uiState.navWidth).toBe(360);
    expect((await loadStore({ "suth-ui-nav-width": "abc" })).store.uiState.navWidth).toBe(232);
  });

  test("ลากกว้าง = จำ; ลากแคบกว่าเกณฑ์ = พับ ไม่เปลี่ยนความกว้างที่จำ; ลากกลับ = กาง", async () => {
    const { store, storage } = await loadStore();
    store.setNavWidth(300);
    expect(store.uiState.navWidth).toBe(300);
    expect(storage.data.get("suth-ui-nav-width")).toBe("300");
    store.setNavWidth(100);
    expect(store.uiState.navCollapsed).toBe(true);
    expect(store.uiState.navWidth).toBe(300);
    store.setNavWidth(170);
    expect(store.uiState.navCollapsed).toBe(false);
    expect(store.uiState.navWidth).toBe(200);
  });

  test("ระหว่างลากไม่เขียน storage และ reset คืน 232", async () => {
    const { store, storage } = await loadStore();
    store.setNavWidth(280, { persist: false });
    expect(storage.data.has("suth-ui-nav-width")).toBe(false);
    store.resetNavWidth();
    expect(store.uiState.navWidth).toBe(232);
  });
});

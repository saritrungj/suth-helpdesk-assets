import { describe, test, expect, vi, beforeEach } from "vitest";

const resetQueryCacheForNewIdentity = vi.fn();

vi.mock("../api/query-client", () => ({
  resetQueryCacheForNewIdentity,
}));

const { authState, setAuth, clearAuth } = await import("./auth");

const alice = { id: 1, username: "alice", role: "staff" };
const bob = { id: 2, username: "bob", role: "viewer" };

beforeEach(() => {
  resetQueryCacheForNewIdentity.mockReset();
  authState.user = null;
  authState.ready = false;
});

describe("ล้างแคชเมื่อเปลี่ยนตัวตนผู้ใช้ (issue #29)", () => {
  test("ล็อกอินจากสถานะยังไม่ล็อกอิน — ต้องล้างแคช", () => {
    setAuth(alice);
    expect(resetQueryCacheForNewIdentity).toHaveBeenCalledOnce();
  });

  test("สลับไปบัญชีอื่นโดยไม่ผ่าน logout — ต้องล้างแคช", () => {
    setAuth(alice);
    resetQueryCacheForNewIdentity.mockReset();

    setAuth(bob);

    expect(resetQueryCacheForNewIdentity).toHaveBeenCalledOnce();
  });

  test("ยืนยันตัวตนซ้ำเป็นคนเดิม (refresh หน้า) — ต้องไม่ล้าง ไม่งั้นยิงใหม่ทั้งแอปทุกครั้ง", () => {
    setAuth(alice);
    resetQueryCacheForNewIdentity.mockReset();

    setAuth({ ...alice });

    expect(resetQueryCacheForNewIdentity).not.toHaveBeenCalled();
  });

  test("logout ตอนที่ล็อกอินอยู่ — ต้องล้างแคช", () => {
    setAuth(alice);
    resetQueryCacheForNewIdentity.mockReset();

    clearAuth();

    expect(resetQueryCacheForNewIdentity).toHaveBeenCalledOnce();
  });

  test("clearAuth ตอนที่ยังไม่ได้ล็อกอินอยู่แล้ว — ไม่ต้องล้างซ้ำ", () => {
    clearAuth();
    expect(resetQueryCacheForNewIdentity).not.toHaveBeenCalled();
  });

  test("บทบาทเปลี่ยนแต่เป็น id เดิม — ต้องล้าง เพราะสิทธิ์อ่านอาจต่างไปแล้ว", () => {
    setAuth(alice);
    resetQueryCacheForNewIdentity.mockReset();

    setAuth({ ...alice, role: "admin" });

    expect(resetQueryCacheForNewIdentity).toHaveBeenCalledOnce();
  });
});

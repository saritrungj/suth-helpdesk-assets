import { describe, test, expect, vi, beforeEach } from "vitest";

// mock ตัว HTTP client ก่อน import อะไรที่ใช้มัน — ไม่งั้น services/api จะลาก router
// และ component ทั้งหมดเข้ามาด้วย ซึ่งไม่ใช่สิ่งที่เทสชุดนี้สนใจ
const get = vi.fn();
const post = vi.fn();

vi.mock("../services/api", () => ({
  default: { get, post },
}));

const { authState, setAuth, clearAuth } = await import("./auth");
const { restoreSession, logout } = await import("./session");

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  authState.user = null;
  authState.ready = false;
});

describe("authState", () => {
  test("เริ่มต้นต้องไม่มีผู้ใช้และยังไม่พร้อม", () => {
    expect(authState.user).toBe(null);
    expect(authState.ready).toBe(false);
  });

  test("setAuth เก็บผู้ใช้และตั้ง ready", () => {
    setAuth({ id: 1, username: "admin", role: "admin" });
    expect(authState.user.username).toBe("admin");
    expect(authState.ready).toBe(true);
  });

  test("clearAuth ล้างผู้ใช้แต่ยังถือว่า ready", () => {
    setAuth({ id: 1, username: "admin", role: "admin" });
    clearAuth();
    expect(authState.user).toBe(null);
    expect(authState.ready).toBe(true);
  });

  test("ไม่มี token หรือรหัสผ่านเก็บอยู่ใน state เลย", () => {
    setAuth({ id: 1, username: "admin", role: "admin" });
    const keys = Object.keys(authState.user);
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("password");
  });
});

describe("restoreSession", () => {
  test("ถาม /auth/me แล้วเก็บผู้ใช้ที่ได้กลับมา", async () => {
    get.mockResolvedValue({ data: { user: { id: 1, username: "admin", role: "admin" } } });

    await restoreSession();

    expect(get).toHaveBeenCalledWith("/auth/me", { skipAuthRedirect: true });
    expect(authState.user.username).toBe("admin");
    expect(authState.ready).toBe(true);
  });

  test("401 ถือว่ายังไม่ได้ล็อกอิน ไม่ throw ออกมา", async () => {
    get.mockRejectedValue({ response: { status: 401 } });

    await expect(restoreSession()).resolves.toBeUndefined();
    expect(authState.user).toBe(null);
    expect(authState.ready).toBe(true);
  });

  test("API ล่มก็ต้องไม่ทำให้แอปค้าง — ถือว่ายังไม่ได้ล็อกอิน", async () => {
    get.mockRejectedValue(new Error("Network Error"));

    await expect(restoreSession()).resolves.toBeUndefined();
    expect(authState.user).toBe(null);
    expect(authState.ready).toBe(true);
  });

  test("ต้องส่ง skipAuthRedirect เพื่อไม่ให้ 401 ปกติเด้งไปหน้า login พร้อม toast", async () => {
    get.mockResolvedValue({ data: { user: { id: 1 } } });
    await restoreSession();

    expect(get.mock.calls[0][1]).toMatchObject({ skipAuthRedirect: true });
  });
});

describe("logout", () => {
  test("สั่งเซิร์ฟเวอร์ลบ cookie แล้วล้าง state", async () => {
    setAuth({ id: 1, username: "admin", role: "admin" });
    post.mockResolvedValue({ data: { message: "Logged out" } });

    await logout();

    expect(post).toHaveBeenCalledWith("/auth/logout", null, { skipAuthRedirect: true });
    expect(authState.user).toBe(null);
  });

  test("เรียก API ไม่สำเร็จก็ต้องหลุดออกจากระบบฝั่งเว็บอยู่ดี", async () => {
    setAuth({ id: 1, username: "admin", role: "admin" });
    post.mockRejectedValue(new Error("Network Error"));

    await expect(logout()).resolves.toBeUndefined();
    expect(authState.user).toBe(null);
  });
});

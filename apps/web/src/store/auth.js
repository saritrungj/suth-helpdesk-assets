import { reactive } from "vue";

// reactive state เดียวที่ทุก component (Sidebar, Navbar, Login) ใช้ร่วมกัน
// แทนการอ่าน localStorage.getItem("user") ตรงๆ ตอน setup ซึ่งไม่ reactive
export const authState = reactive({
  user: JSON.parse(localStorage.getItem("user") || "null"),
});

export function setAuth(user, token) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  authState.user = user;
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  authState.user = null;
}
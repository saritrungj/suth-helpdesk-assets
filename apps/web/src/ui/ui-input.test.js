// @vitest-environment jsdom
import { describe, test, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiInput from "./UiInput.vue";

describe("UiInput นอก UiField", () => {
  // ช่องในตารางกรอกไม่มี UiField ครอบ — ถ้า aria ที่เขียนเองถูกทับเป็น undefined
  // โปรแกรมอ่านหน้าจอจะไม่รู้ว่าช่องไหนผิดและผิดเพราะอะไร (#230)
  test("คง aria-invalid และ aria-describedby ที่ผู้เรียกใส่มา", () => {
    const wrapper = mount(UiInput, {
      attrs: { "aria-invalid": "true", "aria-describedby": "entry-problem-7" },
    });

    const input = wrapper.find("input");
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-describedby")).toBe("entry-problem-7");
  });

  test("ไม่ใส่มา = ไม่มี attribute", () => {
    const input = mount(UiInput).find("input");
    expect(input.attributes("aria-invalid")).toBeUndefined();
    expect(input.attributes("aria-describedby")).toBeUndefined();
  });
});

describe("UiInput — แป้นพิมพ์บนมือถือ", () => {
  // หน้าบันทึกจำนวนพิมพ์ใส่ inputmode="numeric" ให้ช่อง type="text" (รับตัวเลขที่วางมาพร้อมจุลภาค)
  // เดิมค่านี้ถูกทับเป็นว่าง มือถือจึงขึ้นแป้นตัวอักษร (#249)
  test("inputmode ที่ผู้เรียกใส่มาไปถึง input", () => {
    const input = mount(UiInput, { attrs: { inputmode: "numeric" } }).find("input");
    expect(input.attributes("inputmode")).toBe("numeric");
  });

  test("ไม่ใส่มา: type number ได้ decimal, tel ได้ tel, text ไม่มี", () => {
    expect(mount(UiInput, { props: { type: "number" } }).find("input").attributes("inputmode")).toBe("decimal");
    expect(mount(UiInput, { props: { type: "tel" } }).find("input").attributes("inputmode")).toBe("tel");
    expect(mount(UiInput).find("input").attributes("inputmode")).toBeUndefined();
  });
});

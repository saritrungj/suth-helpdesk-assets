import { expect, test } from "vitest";
import { useExportTask } from "./useExportTask";

test("กดซ้ำระหว่างสร้างไฟล์ไม่ได้ไฟล์ซ้ำ และปลดสถานะเมื่อจบ", async () => {
  const task = useExportTask();
  let finish;
  let calls = 0;
  const first = task.run(() => { calls += 1; return new Promise((resolve) => { finish = resolve; }); });
  expect(task.busy.value).toBe(true);
  expect(await task.run(async () => { calls += 1; })).toBe(false);
  finish();
  expect(await first).toBe(true);
  expect(calls).toBe(1);
  expect(task.busy.value).toBe(false);
});

test("ส่งออกล้มแล้วบอกข้อผิดพลาด และลองใหม่ได้โดยล้างข้อความเดิม", async () => {
  const task = useExportTask();
  expect(await task.run(async () => { throw new Error("disk full"); })).toBe(false);
  expect(task.error.value).not.toBe("");
  expect(task.busy.value).toBe(false);
  expect(await task.run(async () => {})).toBe(true);
  expect(task.error.value).toBe("");
});

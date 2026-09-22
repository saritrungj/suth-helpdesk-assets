// apps/web/src/components/device-import.js — ตรรกะของหน้าตรวจนำเข้าทะเบียนเครื่อง (#132)
//
// แยกจาก DeviceImportPanel.vue ให้เทสได้โดยไม่ต้อง render: แปลงสิ่งที่ผู้ดูแลเลือกบนหน้า
// เป็น decisions ที่ API รับ และสร้างตัวเลือก "สร้างใหม่ / เป็นชื่อเรียกอื่นของ…"

import { t } from "../lib/locale";

/** อ่านค่าด้วยชื่อจากไฟล์ — ชื่ออย่าง "constructor" ต้องไม่ไปเจอฟังก์ชันใน prototype */
const own = (object, key) => (object && Object.hasOwn(object, key) ? object[key] : undefined);

export const NAME_KINDS = ["brand", "building", "division"];

export const KIND_LABEL = {
  brand: "ยี่ห้อ",
  building: "อาคาร",
  division: "ฝ่าย",
};

/** ค่าในกล่องเลือกเป็นข้อความเสมอ: "create", "alias:<id>", "new:<ชื่อในไฟล์>" หรือ "" (ยังไม่เลือก) */
export function choiceFromDecision(decision) {
  if (!decision) return "";
  if (decision.action === "create") return "create";
  if (decision.target_id) return `alias:${decision.target_id}`;
  if (decision.target_new) return `new:${decision.target_new}`;
  // same_as_new: ชื่อนี้คือชื่อทางการของรายการใหม่อีกรายการ ระบบจับคู่ให้เองแล้ว
  return "";
}

function decisionFromChoice(choice) {
  if (choice === "create") return { action: "create" };
  if (choice.startsWith("alias:")) return { action: "alias", target_id: Number(choice.slice(6)) };
  if (choice.startsWith("new:")) return { action: "alias", target_new: choice.slice(4) };
  return null;
}

/**
 * @param {Record<string, Record<string, string>>} names ค่าในกล่องเลือกต่อชนิด ต่อชื่อในไฟล์
 * @param {Record<string, { category: string, color: boolean }>} models ต่อ key ของรุ่น
 * @param {Record<string, Record<string, string>>} [renames] ชื่อทางการที่จะสร้าง (เมื่อเลือก "สร้างใหม่")
 */
export function buildDecisions(names, models, renames = {}) {
  const result = { names: {}, models: {} };
  for (const kind of NAME_KINDS) {
    for (const [name, choice] of Object.entries(names[kind] ?? {})) {
      const decision = choice && decisionFromChoice(choice);
      if (!decision) continue;
      // ชื่อเรียกอื่นของรายการใหม่ใช้ได้เฉพาะเมื่อรายการนั้นถูกเลือกให้สร้างจริง
      if (decision.target_new && own(names[kind], decision.target_new) !== "create") continue;
      const as = String(own(renames[kind], name) ?? "").trim();
      if (decision.action === "create" && as && as !== name) decision.as = as;
      (result.names[kind] ??= {})[name] = decision;
    }
  }
  for (const [key, model] of Object.entries(models)) {
    if (model?.category) {
      result.models[key] = { meter_category_id: Number(model.category), has_color_meter: Boolean(model.color) };
    }
  }
  return result;
}

/**
 * ตัวเลือกของชื่อหนึ่งชื่อ: สร้างใหม่ / ชื่อเรียกอื่นของรายการในระบบ / ชื่อเรียกอื่นของชื่ออื่นที่กำลังสร้าง
 */
export function nameOptions(kind, name, existing, names) {
  const creating = Object.entries(names[kind] ?? {})
    .filter(([other, choice]) => other !== name && choice === "create")
    .map(([other]) => ({ value: `new:${other}`, label: t("ชื่อเรียกอื่นของ {0} (สร้างใหม่ในไฟล์นี้)", [other]) }));
  return [
    { value: "create", label: t("สร้าง{0}ใหม่ชื่อนี้", [t(KIND_LABEL[kind])]) },
    ...creating,
    ...existing.map((row) => ({ value: `alias:${row.id}`, label: t("ชื่อเรียกอื่นของ {0}", [row.name]) })),
  ];
}

/** ข้อความของสิ่งที่ยังกันการบันทึกอยู่ */
export function blockingMessages(blocking = []) {
  return blocking.map((item) => {
    switch (item.code) {
      case "undecided_brand":
        return t("เลือกยี่ห้อที่ยังไม่รู้จักอีก {0} รายการ", [item.count]);
      case "undecided_building":
        return t("เลือกอาคารที่ยังไม่รู้จักอีก {0} รายการ", [item.count]);
      case "undecided_division":
        return t("เลือกฝ่ายที่ยังไม่รู้จักอีก {0} รายการ", [item.count]);
      case "undecided_model":
        return t("เลือกหมวดมิเตอร์ของรุ่นอีก {0} รุ่น", [item.count]);
      case "missing_contract":
        return t("สร้างสัญญา {0} ที่หน้าสัญญาก่อน แล้วตรวจไฟล์อีกครั้ง", [item.contracts.join(", ")]);
      default:
        return item.code;
    }
  });
}

/** ป้ายของสิ่งที่จะเกิดกับแถว */
export function actionLabel(action) {
  return {
    create: t("สร้างใหม่"),
    fill: t("เติมช่องที่ว่าง"),
    unchanged: t("ไม่เปลี่ยน"),
    skip: t("ข้าม"),
    pending: t("รอการเลือก"),
  }[action] ?? action;
}

/** เริ่มค่ากล่องเลือกจากผลตรวจ — เก็บสิ่งที่เลือกไว้แล้ว ชื่อใหม่เริ่มเป็น "ยังไม่เลือก" */
export function initialChoices(preview, previous = { names: {}, models: {} }) {
  const names = {};
  for (const kind of NAME_KINDS) {
    names[kind] = {};
    for (const entry of preview.unresolved?.[kind] ?? []) {
      // สิ่งที่ผู้ดูแลเลือกไว้ชนะ ถ้ายังไม่ได้เลือก ใช้สิ่งที่ระบบจับคู่ให้ (เช่น ชื่อทางการของรายการใหม่)
      names[kind][entry.name] = own(previous.names?.[kind], entry.name) || choiceFromDecision(entry.decision);
    }
  }
  // ชื่อทางการเริ่มเป็นชื่อในไฟล์ ผู้ดูแลแก้เป็นชื่อจริงได้ (เช่น เติม "อาคาร" นำหน้า ตัด "(EMC)")
  const renames = {};
  for (const kind of NAME_KINDS) {
    renames[kind] = {};
    for (const entry of preview.unresolved?.[kind] ?? []) {
      renames[kind][entry.name] = own(previous.renames?.[kind], entry.name) ?? entry.decision?.as ?? entry.name;
    }
  }
  const models = {};
  for (const model of preview.models ?? []) {
    const kept = own(previous.models, model.key);
    models[model.key] = kept ?? {
      category: model.meter_category_id ? String(model.meter_category_id) : "",
      color: Boolean(model.has_color_meter),
    };
  }
  return { names, models, renames };
}

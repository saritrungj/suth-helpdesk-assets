import {
  Boxes,
  Building2,
  CalendarRange,
  ChartColumnBig,
  CirclePlus,
  FileSpreadsheet,
  FolderTree,
  Gauge,
  Layers,
  Printer,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
  Wallet,
} from "lucide-vue-next";

/**
 * navigation.js — โครงสร้างเมนูของทั้งระบบ ที่เดียว
 *
 * ทั้งแถบเมนูด้านข้าง แถบนำทางบนสุด (breadcrumb) และช่องค้นหาคำสั่ง (Ctrl+K)
 * อ่านจากรายการชุดเดียวกันนี้ — เพิ่มหน้าใหม่ที่นี่ที่เดียวแล้วโผล่ครบทุกที่
 * เดิมเมนูถูกเขียนไว้ใน Sidebar.vue อย่างเดียว ทำให้ไม่มีทางรู้ชื่อหน้าจาก
 * ที่อื่นได้เลย และหน้าใหม่ที่ลืมใส่เมนูจะเข้าถึงได้ด้วยการพิมพ์ URL เท่านั้น
 *
 * โครงสร้างของแต่ละรายการ
 *   to        เส้นทางของหน้า (string หรือ object แบบเดียวกับ RouterLink)
 *   label     ชื่อที่คนเห็น — ใช้เป็นชื่อหน้าใน breadcrumb ด้วย
 *   icon      component ไอคอนจาก lucide
 *   keywords  คำที่พิมพ์แล้วต้องเจอหน้านี้ในช่องค้นหาคำสั่ง (คำอังกฤษ คำย่อ
 *             คำที่คนเรียกกันเองแต่ไม่ใช่ชื่อทางการ)
 *   admin     true = เห็นเฉพาะผู้ใช้ที่เป็น admin
 */

/**
 * สี่กลุ่มนี้เรียงตาม "จังหวะของงานจริง" ไม่ใช่ตามโครงสร้างฐานข้อมูล
 *
 *   ศูนย์งาน    เปิดมาแล้วรู้ทันทีว่าวันนี้มีอะไรค้าง
 *   งานประจำ    สิ่งที่ต้องทำซ้ำทุกเดือน — กรอกมิเตอร์ และดูแลทะเบียนให้ตรง
 *   วิเคราะห์   ตอบคำถามเรื่องเงิน ทำเป็นครั้งคราวตอนมีคนถามหรือตรวจใบแจ้งหนี้
 *   จัดการระบบ  ตั้งค่าที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก
 *
 * ลำดับนี้คือความถี่ในการใช้จากมากไปน้อย ของที่ใช้ทุกวันจึงอยู่บนสุดเสมอ
 *
 * "เพิ่มเครื่อง" และ "นำเข้าไฟล์" ไม่อยู่ในเมนู เพราะเป็น **การกระทำกับทะเบียน**
 * ไม่ใช่สถานที่ — ปุ่มของมันอยู่ในหน้าทะเบียนซึ่งเป็นที่ที่คนกำลังมองข้อมูลอยู่
 * แล้ว การมีทั้ง "ทะเบียน" และ "เพิ่มทรัพย์สิน" เป็นสองรายการในเมนูเคยทำให้คน
 * เข้าหน้าเพิ่มไปทั้งที่ตั้งใจจะไปแก้ของเดิม
 */
export const NAV_GROUPS = [
  {
    key: "today",
    label: "ศูนย์งาน",
    items: [
      {
        to: "/dashboard",
        label: "แดชบอร์ด",
        icon: Gauge,
        keywords: "dashboard home หน้าแรก ภาพรวม สรุป งานค้าง",
      },
    ],
  },
  {
    key: "routine",
    label: "งานประจำ",
    items: [
      {
        to: "/print-transactions",
        label: "บันทึกยอดพิมพ์",
        icon: Printer,
        keywords: "meter มิเตอร์ ยอดพิมพ์ print counter บันทึก กรอก",
      },
      {
        to: "/assets",
        label: "ทะเบียนทรัพย์สิน",
        icon: Boxes,
        keywords: "asset device เครื่อง ทะเบียน ครุภัณฑ์ printer เพิ่ม นำเข้า",
      },
    ],
  },
  {
    key: "analyse",
    label: "วิเคราะห์",
    items: [
      {
        to: "/expense",
        label: "ค่าใช้จ่าย",
        icon: Wallet,
        keywords: "expense cost เงิน ค่าใช้จ่าย งบ สัญญา แผนก",
      },
      {
        to: "/compare",
        label: "เปรียบเทียบรายเดือน",
        icon: ChartColumnBig,
        keywords: "compare เทียบ เดือน month",
      },
      {
        to: "/report",
        label: "รายงานสรุป",
        icon: ScrollText,
        keywords: "report สรุป พิมพ์ออก export",
      },
    ],
  },
];

/**
 * จัดการระบบ — แบนเป็นชั้นเดียว ไม่แบ่งกลุ่มย่อยอีกแล้ว
 *
 * เดิมแบ่งเป็นสี่หัวข้อย่อย (อุปกรณ์ / สถานที่ / หน่วยงาน / สัญญา) รวมกันแล้ว
 * กินความสูง 13 บรรทัดสำหรับ 9 รายการ ทำให้แถบเมนูต้องเลื่อนบนจอ 900px
 * หัวข้อย่อยที่มีสมาชิกสองรายการไม่ได้ช่วยให้หาเร็วขึ้น แต่ทำให้ทุกอย่างยาวขึ้น
 */
export const ADMIN_GROUPS = [
  {
    key: "admin",
    label: "จัดการระบบ",
    admin: true,
    items: [
      {
        to: "/admin/contracts",
        label: "สัญญา",
        icon: ReceiptText,
        keywords: "contract สัญญา ราคาต่อแผ่น",
        admin: true,
      },
      {
        to: "/admin/fiscal-years",
        label: "ปีงบประมาณ",
        icon: CalendarRange,
        keywords: "fiscal year ปีงบ งบประมาณ",
        admin: true,
      },
      {
        to: "/admin/brands",
        label: "ยี่ห้อ",
        icon: Tags,
        keywords: "brand ยี่ห้อ รุ่น",
        admin: true,
      },
      {
        to: "/admin/buildings",
        label: "อาคาร",
        icon: Building2,
        keywords: "building อาคาร ตึก",
        admin: true,
      },
      {
        to: "/admin/floors",
        label: "ชั้น",
        icon: Layers,
        keywords: "floor ชั้น",
        admin: true,
      },
      {
        to: "/admin/divisions",
        label: "ฝ่าย",
        icon: Users,
        keywords: "division ฝ่าย",
        admin: true,
      },
      {
        to: "/admin/departments",
        label: "แผนก",
        icon: FolderTree,
        keywords: "department แผนก หน่วยงาน",
        admin: true,
      },
      {
        to: "/admin/users",
        label: "จัดการผู้ใช้งาน",
        icon: UserCog,
        keywords: "user account ผู้ใช้ รหัสผ่าน สิทธิ์",
        admin: true,
      },
    ],
  },
];

/**
 * หน้าที่เข้าถึงได้แต่ไม่มีรายการในเมนู — ยังต้องมีชื่อสำหรับ breadcrumb,
 * `document.title` และช่องค้นหาคำสั่ง
 *
 * "เพิ่มทรัพย์สิน" อยู่ที่นี่เพราะเป็นการกระทำที่มีหน้าเป็นของตัวเอง คนที่รู้จัก
 * มันอยู่แล้วต้องพิมพ์ Ctrl+K แล้วเจอ แต่ไม่ควรกินที่ในเมนูถาวร
 */
export const HIDDEN_NAV_ITEMS = [
  {
    to: "/admin/add-asset",
    label: "เพิ่มทรัพย์สิน",
    icon: CirclePlus,
    keywords: "add new เพิ่ม สร้าง import นำเข้า เครื่องใหม่",
    admin: true,
  },
];

/** ทุกรายการแบนเป็นชั้นเดียว สำหรับช่องค้นหาคำสั่งและการหาชื่อหน้าปัจจุบัน */
export const ALL_NAV_ITEMS = [
  ...[...NAV_GROUPS, ...ADMIN_GROUPS].flatMap((group) =>
    group.items.map((item) => ({ ...item, groupLabel: group.label }))
  ),
  ...HIDDEN_NAV_ITEMS.map((item) => ({ ...item, groupLabel: "จัดการระบบ" })),
];

/** ไอคอนสำหรับหัวข้อกลุ่ม Admin ในแถบเมนู */
export const ADMIN_ICON = ShieldCheck;

/** ไอคอนของหน้านำเข้าไฟล์ ใช้ในปุ่มลัดของแดชบอร์ด */
export const IMPORT_ICON = FileSpreadsheet;

function pathOf(to) {
  return typeof to === "string" ? to : to.path;
}

function queryOf(to) {
  return typeof to === "string" ? {} : to.query || {};
}

/**
 * รายการเมนูนี้ตรงกับหน้าที่กำลังเปิดอยู่หรือไม่
 *
 * เทียบ path เสมอ และเทียบเฉพาะ query key ที่รายการนั้นระบุไว้ — หน้าเดียวกัน
 * ที่ต่างกันแค่ ?tab= ถือเป็นคนละรายการเมนู แต่ ?fy= ที่ระบบเติมให้เองทุกหน้า
 * ต้องไม่ทำให้เมนูเลิก active
 */
export function matchesRoute(item, route) {
  if (pathOf(item.to) !== route.path) return false;
  return Object.entries(queryOf(item.to)).every(([key, value]) => route.query[key] === value);
}

/**
 * หารายการเมนูที่ตรงกับหน้าปัจจุบัน ใช้ตั้งชื่อหน้าใน breadcrumb และ document.title
 *
 * ไล่หาสามชั้นตามลำดับ
 *   1. ตรงทั้ง path และ query ที่รายการนั้นระบุไว้ (แยก ?tab= ออกจากกันได้)
 *   2. ตรงเฉพาะ path
 *   3. เป็น "หน้าลูก" ของรายการใดรายการหนึ่ง เช่น /assets/17 -> /assets
 *
 * ชั้นที่ 3 จำเป็นเพราะหน้ารายละเอียดไม่มีรายการเมนูของตัวเอง ถ้าไม่มีชั้นนี้
 * แถบเมนูจะไม่ไฮไลต์อะไรเลยตอนเปิดหน้ารายละเอียด และ breadcrumb จะขึ้นชื่อระบบ
 * ซ้ำสองครั้ง ("ระบบทรัพย์สิน IT › ระบบทรัพย์สิน IT") ซึ่งไม่บอกอะไรกับใคร
 *
 * เลือกรายการที่ path ยาวที่สุดที่ยังเป็นคำนำหน้า เพื่อไม่ให้ "/" ชนะทุกอย่าง
 */
export function findActiveItem(route) {
  const exact =
    ALL_NAV_ITEMS.find((item) => matchesRoute(item, route)) ??
    ALL_NAV_ITEMS.find((item) => pathOf(item.to) === route.path);

  if (exact) return exact;

  return (
    ALL_NAV_ITEMS.filter((item) => route.path.startsWith(`${pathOf(item.to)}/`)).sort(
      (a, b) => pathOf(b.to).length - pathOf(a.to).length
    )[0] ?? null
  );
}

/**
 * รายการเมนูนี้ควรถูกไฮไลต์อยู่หรือไม่ — ใช้กับแถบเมนูด้านข้าง
 *
 * ต่างจาก `matchesRoute` ตรงที่นับ "หน้าลูก" ด้วย: ตอนเปิด /assets/17 รายการ
 * "ทะเบียนทรัพย์สิน" ต้องยังสว่างอยู่ ไม่งั้นแถบเมนูจะดับทั้งแถบแล้วผู้ใช้ไม่รู้
 * ว่าตัวเองอยู่ส่วนไหนของระบบ
 */
export function isActiveNav(item, route) {
  if (matchesRoute(item, route)) return true;

  // เทียบด้วย path ไม่ใช่ด้วย === เพราะ ALL_NAV_ITEMS เก็บ "สำเนา" ของแต่ละ
  // รายการ (คัดลอกมาเติม groupLabel) ส่วนแถบเมนูวนบนต้นฉบับใน NAV_GROUPS
  // การเทียบด้วย === จึงเป็นเท็จเสมอ และไม่มีอะไรสว่างเลย
  const active = findActiveItem(route);
  return Boolean(active) && pathOf(active.to) === pathOf(item.to);
}

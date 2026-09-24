// apps/api/src/import/zip-limit.js
//
// กันไฟล์ .xlsx ที่คลายแล้วใหญ่ผิดปกติ ก่อนส่งให้ SheetJS (#207)
//
// .xlsx คือ zip ของไฟล์ XML เพดาน 5 MB ของการอัปโหลดวัดขนาดหลังบีบอัด ส่วน SheetJS คลายทุกส่วนเข้าหน่วยความจำ
// ทั้งก้อน ทดสอบบนเครื่องพัฒนา: ไฟล์ 305 KB ที่ XML ข้างในเป็นช่องว่าง 300 MB ทำให้โปรเซสใช้หน่วยความจำ 670 MB
// และโตตามเส้นตรง ไฟล์ใกล้ 5 MB (คลายได้ราว 5 GB) จึงล้ม API ทั้งตัวได้ด้วยการอัปโหลดครั้งเดียว
//
// ตรวจโดยคลายจริงทีละส่วนด้วย zlib ที่ตั้ง maxOutputLength ไม่เชื่อขนาดที่หัว zip ประกาศ เพราะผู้ส่งเขียนตัวเลขนั้น
// เองได้ ใช้หน่วยความจำไม่เกินเพดานที่ตั้งไว้ ไฟล์จริงของผู้ให้เช่าคลายแล้วไม่กี่ MB

const zlib = require("zlib");
const { badRequest } = require("../shared/http-error");

/** เพดานหลังคลาย — ไฟล์จริงที่ใหญ่ที่สุด (รายงานมิเตอร์ 6 แผ่น ~500 เครื่อง) คลายแล้วราว 4 MB */
const ZIP_LIMITS = { total: 80 * 1024 * 1024, entry: 60 * 1024 * 1024, entries: 2000 };

const tooLarge = () => badRequest("ไฟล์นี้คลายแล้วใหญ่ผิดปกติ", {
  code: "file_too_large_uncompressed",
  detail: "ไฟล์จากผู้ให้เช่าคลายแล้วมีขนาดไม่กี่ MB — ไฟล์นี้อาจเสียหายหรือถูกสร้างมาผิดรูปแบบ ลองเปิดด้วย Excel แล้วบันทึกใหม่",
});
const malformed = () => badRequest("ไฟล์นี้เปิดเป็นตารางไม่ได้", {
  code: "unreadable_file",
  detail: "โครงสร้าง zip ของไฟล์ไม่ถูกต้อง — ลองเปิดด้วย Excel แล้วบันทึกใหม่",
});

const isZip = (buffer) => buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;

/**
 * @param {Buffer} buffer เนื้อไฟล์ทั้งไฟล์
 * @param {{ total?: number, entry?: number, entries?: number }} [limits]
 * @throws {ApiError} 400 เมื่อเกินเพดานหรือโครงสร้างผิด — ไฟล์ที่ไม่ใช่ zip (.xls, .csv) ผ่านไปโดยไม่ตรวจ
 */
function assertZipWithinLimits(buffer, limits = {}) {
  if (!isZip(buffer)) return;
  const max = { ...ZIP_LIMITS, ...limits };

  // End of central directory อยู่ท้ายไฟล์ ถัดจาก comment ได้ไม่เกิน 65535 ไบต์
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw malformed();
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  // zip64 (ค่า 0xFFFF/0xFFFFFFFF) ไม่มีในไฟล์ขนาดนี้ — ถ้าเจอคือไฟล์ที่ถูกสร้างมาผิดปกติ
  if (count === 0xffff || offset === 0xffffffff || count > max.entries) throw tooLarge();

  let total = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw malformed();
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    offset += 46 + nameLength + extraLength + commentLength;

    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw malformed();
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + compressed);
    if (data.length !== compressed) throw malformed();

    const room = Math.min(max.entry, max.total - total);
    let size;
    if (method === 0) size = compressed;
    else if (method === 8) {
      try {
        size = zlib.inflateRawSync(data, { maxOutputLength: room + 1 }).length;
      } catch (err) {
        if (err instanceof RangeError || err.code === "ERR_BUFFER_TOO_LARGE") throw tooLarge();
        throw malformed();
      }
    } else throw malformed();
    if (size > room) throw tooLarge();
    total += size;
  }
}

module.exports = { assertZipWithinLimits, ZIP_LIMITS };

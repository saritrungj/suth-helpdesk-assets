import { locale, saveLocale, t } from "../lib/locale";
import { askConfirm } from "../store/confirmDialog";

export async function changeLanguage(value) {
  if (value === locale.value || !["th", "en"].includes(value)) return;
  const confirmed = await askConfirm(
    t("หน้านี้จะโหลดใหม่และข้อมูลในฟอร์มที่ยังไม่บันทึกจะหาย กรุณาบันทึกงานก่อนเปลี่ยนภาษา"),
    {
      title: t("เปลี่ยนภาษา?"),
      confirmText: t("เปลี่ยนภาษา"),
      cancelText: t("กลับไปทำงานต่อ"),
      danger: false,
    },
  );
  if (!confirmed) return;
  // Keep the current page language intact if its native unload guard cancels navigation.
  saveLocale(value);
  window.location.reload();
}

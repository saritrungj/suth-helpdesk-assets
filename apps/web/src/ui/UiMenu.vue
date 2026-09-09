<script setup>
import { usePortalTarget } from "./portal-target";
const portalTarget = usePortalTarget();
/**
 * UiMenu — เมนูที่กางออกจากปุ่ม (บัญชีผู้ใช้, การกระทำเพิ่มเติมในแถวตาราง)
 *
 * ใช้แทนการวางปุ่มเรียงยาวในแถวตาราง เมื่อการกระทำมีเกินสองอย่าง — แถวที่มีปุ่ม
 * สี่ห้าปุ่มทำให้ตาหาข้อมูลจริงไม่เจอ และบนมือถือปุ่มจะเล็กจนกดพลาด
 *
 * ข้อควรระวังที่ Reka UI จัดการให้: เมนูต้องปิดเมื่อเลือกแล้ว, คืนโฟกัสกลับปุ่ม
 * ที่เปิด, เลื่อนด้วยลูกศรและพิมพ์ตัวอักษรแรกเพื่อกระโดดไปรายการนั้น
 *
 * รายการที่ทำลายข้อมูลให้ส่ง tone="danger" — มันจะถูกวางท้ายสุดพร้อมเส้นคั่น
 * เสมอ เพื่อไม่ให้อยู่ติดกับรายการที่กดบ่อยจนกดพลาด
 */
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";

defineProps({
  label: { type: String, default: "" },
  align: { type: String, default: "end" },
  side: { type: String, default: "bottom" },
});
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal :to="portalTarget">
      <DropdownMenuContent
        :align="align"
        :side="side"
        :side-offset="6"
        class="z-[110] min-w-[13rem] p-1 rounded-lg bg-surface-float border border-line-soft shadow-pop
               data-[state=open]:animate-pop-in origin-[var(--reka-dropdown-menu-content-transform-origin)]"
      >
        <DropdownMenuLabel v-if="label" class="px-2.5 py-1.5 eyebrow">
          {{ label }}
        </DropdownMenuLabel>

        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

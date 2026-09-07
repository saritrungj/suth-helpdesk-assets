<script setup>
/**
 * UiTooltip — คำอธิบายสั้นที่โผล่เมื่อชี้เมาส์หรือโฟกัสด้วยคีย์บอร์ด
 *
 * ใช้กับปุ่มไอคอนล้วนและตัวเลขที่ต้องบอกที่มา ไม่ใช้กับข้อมูลที่จำเป็นต่อการ
 * ตัดสินใจ — บนหน้าจอสัมผัสไม่มี hover ข้อมูลที่ซ่อนอยู่ใน tooltip จึงหายไปเลย
 * ถ้าเป็นข้อมูลสำคัญให้เขียนไว้บนหน้าจอตรงๆ
 *
 * Reka UI จัดการเรื่องที่ทำเองยากให้: หน่วงก่อนแสดงเพื่อไม่ให้เด้งรัวตอนกวาดเมาส์
 * ผ่าน, พลิกด้านเองเมื่อชนขอบจอ, ปิดเมื่อกด Esc และผูก aria-describedby ให้
 *
 * ถ้าไม่มีข้อความ จะคืนเฉพาะตัว trigger ออกไปเฉยๆ ทำให้เขียนแบบมีเงื่อนไขได้
 * (`:content="collapsed ? item.label : ''"`) โดยไม่ต้องมี v-if สองชั้นที่จุดใช้งาน
 */
import { computed, useSlots } from "vue";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";

const props = defineProps({
  content: { type: String, default: "" },
  side: { type: String, default: "top" },
  delay: { type: Number, default: 250 },
});

const slots = useSlots();
const enabled = computed(() => Boolean(props.content) || Boolean(slots.content));
</script>

<template>
  <slot v-if="!enabled" />

  <TooltipProvider v-else :delay-duration="delay">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>

      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="6"
          class="z-[120] max-w-xs px-2.5 py-1.5 rounded-md bg-ink text-canvas text-xs leading-snug shadow-e3
                 data-[state=delayed-open]:animate-pop-in"
        >
          <slot name="content">{{ content }}</slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

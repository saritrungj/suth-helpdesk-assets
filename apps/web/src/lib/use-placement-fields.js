import { computed, watch } from "vue";

/**
 * ตัวเลือกอาคาร–ชั้น และฝ่าย–แผนก ของฟอร์มที่ระบุตำแหน่งเครื่อง
 *
 * ทั้งสองคู่เป็นความสัมพันธ์แบบเดียวกัน คือลูกต้องอยู่ใต้พ่อที่เลือกไว้ และเมื่อพ่อเปลี่ยน
 * ค่าลูกเดิมก็ใช้ไม่ได้อีก ฟอร์มแก้ไขเครื่องกับฟอร์มย้ายเคยเขียนกฎนี้ไว้คนละที่ด้วยโค้ด
 * ที่เหมือนกันทุกบรรทัด เวลาแก้พฤติกรรมจึงต้องแก้สองแห่งและมีโอกาสหลุดไปข้างหนึ่ง
 *
 * `ready` กันไม่ให้การเติมค่าตอนโหลดข้อมูลครั้งแรกไปล้างค่าลูกที่เพิ่งโหลดมา
 */
export function usePlacementFields({ form, ready, buildings, floors, divisions, departments }) {
  const toOptions = (items) => items.map((item) => ({ value: item.id, label: item.name }));
  const childrenOf = (items, parentKey, parentId) =>
    parentId ? toOptions(items.filter((item) => Number(item[parentKey]) === Number(parentId))) : [];

  const buildingOptions = computed(() => toOptions(buildings.value));
  const divisionOptions = computed(() => toOptions(divisions.value));
  const floorOptions = computed(() => childrenOf(floors.value, "building_id", form.value.building_id));
  const departmentOptions = computed(() =>
    childrenOf(departments.value, "division_id", form.value.division_id)
  );

  const clearChildOn = (parentKey, childKey) =>
    watch(
      () => form.value[parentKey],
      (_, previous) => {
        if (ready.value && previous !== undefined) form.value[childKey] = "";
      }
    );

  clearChildOn("building_id", "floor_id");
  clearChildOn("division_id", "department_id");

  return { buildingOptions, floorOptions, divisionOptions, departmentOptions };
}

import { computed, watch } from "vue";
import { referenceOptions, resolveReference } from "../lib/reference-filters";

/** IDs identify records; labels are shared by filters, chips and exports. */
export function useReferenceFilters(filters, { buildings, floors, divisions, departments, brands }) {
  const allOptions = computed(() => ({
    building: referenceOptions(buildings.value),
    floor: referenceOptions(floors.value, buildings.value, "building_id"),
    division: referenceOptions(divisions.value),
    department: referenceOptions(departments.value, divisions.value, "division_id"),
    brand: referenceOptions(brands?.value ?? []),
  }));
  const buildingOptions = computed(() => allOptions.value.building);
  const divisionOptions = computed(() => allOptions.value.division);
  const brandOptions = computed(() => allOptions.value.brand);
  const floorOptions = computed(() => referenceOptions(
    floors.value.filter((row) => !filters.value.building || String(row.building_id) === filters.value.building), buildings.value, "building_id",
  ));
  const departmentOptions = computed(() => referenceOptions(
    departments.value.filter((row) => !filters.value.division || String(row.division_id) === filters.value.division), divisions.value, "division_id",
  ));
  // Preserve a valid child when a link replaces parent and child together.
  for (const [parent, child, options] of [
    ["building", "floor", floorOptions], ["division", "department", departmentOptions],
  ]) {
    watch(() => filters.value[parent], () => {
      if (filters.value[child] && !options.value.some((option) => option.value === filters.value[child])) filters.value[child] = "";
    }, { flush: "sync" });
  }
  const referenceLabel = (key, value) => allOptions.value[key]?.find((option) => option.value === String(value))?.label ?? value;
  function normalizeReferences(values) {
    const next = { ...values };
    const rejected = [];
    for (const key of ["building", "division", "floor", "department", "brand"]) {
      if (!(key in next)) continue;
      let options = allOptions.value[key];
      if (key === "floor" && next.building) options = referenceOptions(floors.value.filter((row) => String(row.building_id) === next.building), buildings.value, "building_id");
      if (key === "department" && next.division) options = referenceOptions(departments.value.filter((row) => String(row.division_id) === next.division), divisions.value, "division_id");
      const result = resolveReference(next[key], options);
      next[key] = result.value;
      if (result.rejected) rejected.push(String(values[key]));
    }
    return { values: next, rejected };
  }
  return { buildingOptions, floorOptions, divisionOptions, departmentOptions, brandOptions, referenceLabel, normalizeReferences };
}

const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

/** Registry display order only; never infer a contract number from location text. */
export function compareRegistryLocations(a, b, direction) {
  const left = String(a.location ?? "").trim();
  const right = String(b.location ?? "").trim();
  if (!left && right) return 1;
  if (left && !right) return -1;
  const primary = collator.compare(left, right);
  if (primary) return primary * (direction === "desc" ? -1 : 1);
  return collator.compare(String(a.serial_number ?? "").trim(), String(b.serial_number ?? "").trim())
    || Number(a.id) - Number(b.id);
}

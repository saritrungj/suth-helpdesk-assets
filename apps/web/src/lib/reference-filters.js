export function referenceOptions(rows, parents = [], parentKey = "") {
  const names = new Map(parents.map((row) => [String(row.id), row.name]));
  return rows.map((row) => ({
    value: String(row.id),
    name: row.name,
    label: parentKey ? `${row.name} — ${names.get(String(row[parentKey])) ?? row[parentKey] ?? "—"}` : row.name,
  }));
}

/** Legacy names are accepted only when they identify exactly one record. */
export function resolveReference(value, options) {
  const raw = String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
  if (!raw) return { value: "", rejected: false };
  const id = options.find((option) => option.value === raw);
  if (id) return { value: id.value, rejected: false };
  const matches = options.filter((option) => option.name === raw);
  return matches.length === 1 ? { value: matches[0].value, rejected: false } : { value: "", rejected: true };
}

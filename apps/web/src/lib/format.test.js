import { describe, expect, it } from "vitest";
import { formatCompact } from "./format";

describe("formatCompact", () => {
  it("uses Thai แสน notation at one hundred thousand", () => {
    expect(formatCompact(100_000)).toBe("1 แสน");
    expect(formatCompact(150_000)).toBe("1.5 แสน");
  });

  it("keeps small decimal ticks distinct", () => {
    expect(formatCompact(1.25)).not.toBe(formatCompact(1.5));
  });
});

import { describe, expect, it } from "vitest";
import { formatInputDate, parseInputDate } from "./date-input";

describe("localized date input contract", () => {
  it.each(["ru", "kk"] as const)(
    "presents dotted dates for %s and preserves the ISO request date",
    (language) => {
      expect(formatInputDate("2099-12-10", language)).toBe("10.12.2099");
      expect(parseInputDate("10.12.2099")).toBe("2099-12-10");
    },
  );
  it("presents British English dates and accepts both localized and ISO entry", () => {
    expect(formatInputDate("2099-12-10", "en")).toBe("10/12/2099");
    expect(parseInputDate("10/12/2099")).toBe("2099-12-10");
    expect(parseInputDate("2099-12-10")).toBe("2099-12-10");
  });
  it("supports a numeric mobile keyboard without separators", () => {
    expect(parseInputDate("10122099")).toBe("2099-12-10");
  });
  it.each(["", "10.", "10.13.2099", "00/12/2099", "not a date"])(
    "retains incomplete or invalid input %j for editing and schema validation",
    (value) => {
      expect(parseInputDate(value)).toBe(value);
      expect(formatInputDate(value, "ru")).toBe(value);
    },
  );
});

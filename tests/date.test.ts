import { describe, expect, it } from "vitest";
import { addDays, enumerateDates, getWeekRange } from "../server/utils/date.js";

describe("date utilities", () => {
  it("keeps calendar dates stable across timezone offsets", () => {
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(enumerateDates("2026-06-01", "2026-06-03")).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("returns a Monday-start week range", () => {
    expect(getWeekRange("2026-06-01")).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
    });
  });
});

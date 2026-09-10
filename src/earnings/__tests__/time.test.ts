import {
  addDays,
  dayKeyOf,
  daysBetween,
  daysInMonth,
  daysOfRangeInMonth,
  endOfMonth,
  endOfWeek,
  enumerateDays,
  hoursBetween,
  isDayKey,
  monthsInRange,
  occupiedDays,
  rangeLengthDays,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "../time";

describe("time", () => {
  it("measures a span that crosses midnight without a special case", () => {
    // Clock in 21:00 Tuesday, clock out 05:30 Wednesday.
    expect(hoursBetween("2026-03-03T21:00:00-06:00", "2026-03-04T05:30:00-06:00")).toBe(8.5);
  });

  it("measures a span across a daylight-saving spring forward", () => {
    // US DST 2026 starts 08 March. 23:00 CST to 07:00 CDT is seven hours on the
    // wall clock but only six on the clock the driver was actually working.
    expect(hoursBetween("2026-03-07T23:00:00-06:00", "2026-03-08T07:00:00-05:00")).toBe(7);
  });

  it("rejects an end before its start rather than returning negative work", () => {
    expect(hoursBetween("2026-03-04T10:00:00Z", "2026-03-04T09:00:00Z")).toBeNull();
    expect(hoursBetween("not-a-date", "2026-03-04T09:00:00Z")).toBeNull();
  });

  it("reads the local calendar day off an instant, not the UTC one", () => {
    // 23:30 on the 14th in Chicago is already the 15th in UTC.
    expect(dayKeyOf("2026-03-14T23:30:00-05:00")).toBe("2026-03-14");
    expect(dayKeyOf("garbage")).toBeNull();
  });

  it("validates day keys including impossible dates", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2024-02-29")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-3-1")).toBe(false);
  });

  it("does day arithmetic across month, year and leap boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-08-30", "2026-09-05")).toBe(6);
  });

  it("finds month ends including February in a leap year", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
    expect(daysInMonth("2026-04-15")).toBe(30);
    expect(startOfMonth("2026-04-15")).toBe("2026-04-01");
  });

  it("builds settlement weeks from either week start", () => {
    // 2026-09-10 is a Thursday.
    expect(startOfWeek("2026-09-10", "sunday")).toBe("2026-09-06");
    expect(endOfWeek("2026-09-10", "sunday")).toBe("2026-09-12");
    expect(startOfWeek("2026-09-10", "monday")).toBe("2026-09-07");
    expect(startOfWeek("2026-09-06", "sunday")).toBe("2026-09-06");
  });

  it("finds quarter and year starts", () => {
    expect(startOfQuarter("2026-08-14")).toBe("2026-07-01");
    expect(startOfQuarter("2026-01-01")).toBe("2026-01-01");
    expect(startOfQuarter("2026-12-31")).toBe("2026-10-01");
    expect(startOfYear("2026-08-14")).toBe("2026-01-01");
  });

  it("splits a week that straddles two months into the right share of days", () => {
    // Sunday 30 August 2026 through Saturday 5 September 2026.
    const week = { from: "2026-08-30", to: "2026-09-05" };
    expect(rangeLengthDays(week)).toBe(7);
    expect(monthsInRange(week)).toEqual(["2026-08", "2026-09"]);
    expect(daysOfRangeInMonth(week, "2026-08")).toBe(2);
    expect(daysOfRangeInMonth(week, "2026-09")).toBe(5);
    expect(daysOfRangeInMonth(week, "2026-07")).toBe(0);
  });

  it("enumerates a range inclusively and caps runaway ranges", () => {
    expect(enumerateDays({ from: "2026-03-01", to: "2026-03-04" })).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
    expect(enumerateDays({ from: "2026-03-01", to: "2999-03-04" })).toHaveLength(1000);
  });

  it("counts the calendar days a load tied up the truck, inclusive", () => {
    // Picked up Monday night, delivered Wednesday morning: three days of truck.
    expect(occupiedDays("2026-03-02T20:00:00-06:00", "2026-03-04T09:00:00-06:00")).toBe(3);
    expect(occupiedDays("2026-03-02T08:00:00-06:00", "2026-03-02T18:00:00-06:00")).toBe(1);
    expect(occupiedDays("2026-03-02T08:00:00-06:00", null)).toBe(1);
    expect(occupiedDays(null, null)).toBe(1);
  });
});

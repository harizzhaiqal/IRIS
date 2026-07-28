import { describe, expect, it } from "vitest";

import {
  calculateMinutes,
  hhmmToMinutes,
  minutesToHHMM,
  minutesToLabel,
} from "./duration";

describe("calculateMinutes", () => {
  it("measures a single-day session as elapsed time", () => {
    expect(
      calculateMinutes(
        new Date(2026, 1, 26, 9, 0),
        new Date(2026, 1, 26, 17, 0),
      ),
    ).toBe(480);
  });

  it("counts the daily window once per day across a multi-day course", () => {
    // 26-27 Feb, 09:00-17:00 from the source workbook: 16 hours gross, not the
    // 32 hours separating the two instants.
    expect(
      calculateMinutes(
        new Date(2026, 1, 26, 9, 0),
        new Date(2026, 1, 27, 17, 0),
      ),
    ).toBe(960);
  });

  it("handles a three-day course", () => {
    expect(
      calculateMinutes(
        new Date(2026, 4, 4, 9, 0),
        new Date(2026, 4, 6, 17, 30),
      ),
    ).toBe(1530);
  });

  it("falls back to elapsed time for an overnight session", () => {
    expect(
      calculateMinutes(
        new Date(2026, 2, 3, 21, 0),
        new Date(2026, 2, 4, 1, 0),
      ),
    ).toBe(240);
  });

  it("returns zero when the end is not after the start", () => {
    const at = new Date(2026, 1, 26, 9, 0);
    expect(calculateMinutes(at, at)).toBe(0);
    expect(calculateMinutes(new Date(2026, 1, 26, 17, 0), at)).toBe(0);
  });

  it("accepts ISO strings and rejects unparseable input", () => {
    expect(
      calculateMinutes("2026-02-26T09:00:00", "2026-02-26T12:30:00"),
    ).toBe(210);
    expect(calculateMinutes("not a date", "2026-02-26T12:30:00")).toBe(0);
  });
});

describe("minutesToHHMM", () => {
  it("pads both components", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(5)).toBe("00:05");
    expect(minutesToHHMM(480)).toBe("08:00");
    expect(minutesToHHMM(840)).toBe("14:00");
  });

  it("does not roll hours over at 24", () => {
    expect(minutesToHHMM(2385)).toBe("39:45");
    expect(minutesToHHMM(2880)).toBe("48:00");
  });

  it("clamps invalid input rather than rendering NaN", () => {
    expect(minutesToHHMM(-30)).toBe("00:00");
    expect(minutesToHHMM(Number.NaN)).toBe("00:00");
  });
});

describe("hhmmToMinutes", () => {
  it("parses HH:MM", () => {
    expect(hhmmToMinutes("14:00")).toBe(840);
    expect(hhmmToMinutes("39:45")).toBe(2385);
    expect(hhmmToMinutes("0:30")).toBe(30);
  });

  it("parses whole and decimal hours", () => {
    expect(hhmmToMinutes("7")).toBe(420);
    expect(hhmmToMinutes("7.5")).toBe(450);
    expect(hhmmToMinutes("7,5")).toBe(450);
  });

  it("returns null for input it cannot read", () => {
    expect(hhmmToMinutes("")).toBeNull();
    expect(hhmmToMinutes("abc")).toBeNull();
    expect(hhmmToMinutes("14:75")).toBeNull();
  });

  it("round-trips with minutesToHHMM", () => {
    for (const minutes of [0, 45, 480, 840, 2385]) {
      expect(hhmmToMinutes(minutesToHHMM(minutes))).toBe(minutes);
    }
  });
});

describe("minutesToLabel", () => {
  it("omits empty components", () => {
    expect(minutesToLabel(0)).toBe("0m");
    expect(minutesToLabel(45)).toBe("45m");
    expect(minutesToLabel(120)).toBe("2h");
    expect(minutesToLabel(870)).toBe("14h 30m");
  });
});

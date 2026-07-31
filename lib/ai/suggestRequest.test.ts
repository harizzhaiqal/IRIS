import { describe, expect, it } from "vitest";

import { suggestRequest } from "./suggestRequest";

describe("suggestRequest", () => {
  it("handles the worked example from the specification", () => {
    const result = suggestRequest(
      "I need a new monitor because my current monitor is too small.",
    );

    expect(result.category).toBe("it_equipment");
    expect(result.department).toBe("IT");
    expect(result.priority).toBe("normal");
    expect(result.approvalRequired).toBe(true);
    expect(result.reason).toContain("approval");
  });

  describe("category", () => {
    const cases: [string, string][] = [
      ["My laptop screen flickers", "it_equipment"],
      ["The keyboard has sticky keys", "it_equipment"],
      ["Please install the design software", "software"],
      ["I need a licence for the reporting app", "software"],
      ["Requesting a new chair", "office_furniture"],
      ["A standing desk for my corner", "office_furniture"],
      ["My access card stopped opening the door", "access_card"],
      ["Please print new name cards", "name_card"],
      ["The aircond is not cooling", "maintenance"],
      ["Whiteboard markers for the planning wall", "office_equipment"],
      ["I would like a parking bay", "other"],
    ];

    for (const [description, expected] of cases) {
      it(`reads "${description}" as ${expected}`, () => {
        expect(suggestRequest(description).category).toBe(expected);
      });
    }

    it("files a laptop repair under IT rather than maintenance", () => {
      // Both rule sets match "repair"; the equipment rule has to win.
      expect(suggestRequest("My laptop needs repair").category).toBe(
        "it_equipment",
      );
    });

    it("files an office repair under maintenance", () => {
      expect(suggestRequest("Please repair office ceiling light").category).toBe(
        "maintenance",
      );
    });
  });

  describe("priority", () => {
    it("is urgent when the description says work is blocked", () => {
      expect(suggestRequest("My laptop is broken and I cannot work").priority).toBe(
        "urgent",
      );
    });

    it("is urgent for a safety problem", () => {
      expect(suggestRequest("Loose cable is a safety risk").priority).toBe("urgent");
    });

    it("is high for a repair or replacement", () => {
      expect(suggestRequest("My chair is damaged, needs replacement").priority).toBe(
        "high",
      );
    });

    it("is high for an access issue", () => {
      expect(suggestRequest("I have an access issue at the back door").priority).toBe(
        "high",
      );
    });

    it("is normal for a standard equipment request", () => {
      expect(suggestRequest("Requesting a second monitor").priority).toBe("normal");
    });

    it("is low when the request is nice to have", () => {
      expect(
        suggestRequest("A footrest would be nice to have").priority,
      ).toBe("low");
    });

    it("prefers urgent over high when both are present", () => {
      // "repair" alone is high, but the work is stopped, so urgent must win.
      expect(
        suggestRequest("Printer is down, cannot work, please repair").priority,
      ).toBe("urgent");
    });
  });

  describe("approval", () => {
    it("is required for anything that spends money", () => {
      expect(suggestRequest("New monitor please").approvalRequired).toBe(true);
      expect(suggestRequest("A new office chair").approvalRequired).toBe(true);
      expect(suggestRequest("Install the licensed IDE").approvalRequired).toBe(true);
    });

    it("is not required for access and building faults", () => {
      expect(suggestRequest("My access card is not working").approvalRequired).toBe(
        false,
      );
      expect(suggestRequest("The aircond needs maintenance").approvalRequired).toBe(
        false,
      );
    });
  });

  describe("department", () => {
    it("routes equipment and software to IT", () => {
      expect(suggestRequest("New laptop").department).toBe("IT");
      expect(suggestRequest("Install software").department).toBe("IT");
    });

    it("routes building faults to Facilities", () => {
      expect(suggestRequest("Ceiling light is out").department).toBe("Facilities");
    });

    it("routes everything else to Admin", () => {
      expect(suggestRequest("New chair").department).toBe("Admin");
      expect(suggestRequest("Name cards").department).toBe("Admin");
      expect(suggestRequest("Something unusual").department).toBe("Admin");
    });
  });

  it("is deterministic — the same text always suggests the same thing", () => {
    const text = "My monitor is too small for reviewing code";
    expect(suggestRequest(text)).toEqual(suggestRequest(text));
  });

  it("does not throw on an empty description", () => {
    const result = suggestRequest("");
    expect(result.category).toBe("other");
    expect(result.priority).toBe("normal");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(suggestRequest("   MY LAPTOP IS BROKEN   ")).toEqual(
      suggestRequest("my laptop is broken"),
    );
  });
});

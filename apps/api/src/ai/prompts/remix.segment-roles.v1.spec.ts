import { describe, expect, it } from "vitest";
import {
  REMIX_SEGMENT_ROLES_V1_KEY,
  buildRemixSegmentRolesPrompt,
  parseSegmentRolesJson,
} from "./remix.segment-roles.v1";

describe("remix.segment-roles.v1", () => {
  describe("buildRemixSegmentRolesPrompt", () => {
    it("includes the key marker and paired source/translated text with indexes", () => {
      const { system, user } = buildRemixSegmentRolesPrompt({
        pairs: [
          { index: 0, sourceText: "你好", translatedText: "Xin chào" },
          { index: 1, sourceText: "再见", translatedText: "Tạm biệt" },
        ],
      });

      expect(user).toContain(`[${REMIX_SEGMENT_ROLES_V1_KEY}]`);
      expect(user).toContain('"index": 0');
      expect(user).toContain("你好");
      expect(user).toContain("Xin chào");
      expect(user).toContain('"index": 1');
      expect(system).toContain("narration");
      expect(system).toContain("source");
    });
  });

  describe("parseSegmentRolesJson", () => {
    it("maps a valid JSON response 1:1 by index", () => {
      const raw = JSON.stringify({
        roles: [
          { index: 0, role: "narration" },
          { index: 1, role: "source" },
        ],
      });

      const result = parseSegmentRolesJson(raw, 2);

      expect(result).toEqual([
        { index: 0, role: "narration" },
        { index: 1, role: "source" },
      ]);
    });

    it("parses JSON wrapped in a markdown fence", () => {
      const raw = ["```json", JSON.stringify({ roles: [{ index: 0, role: "source" }] }), "```"].join(
        "\n",
      );

      expect(parseSegmentRolesJson(raw, 1)).toEqual([{ index: 0, role: "source" }]);
    });

    it("throws when the role count does not match the expected length", () => {
      const raw = JSON.stringify({ roles: [{ index: 0, role: "narration" }] });

      expect(() => parseSegmentRolesJson(raw, 2)).toThrow();
    });

    it("throws when an index is missing from the response", () => {
      const raw = JSON.stringify({
        roles: [
          { index: 0, role: "narration" },
          { index: 2, role: "source" },
        ],
      });

      expect(() => parseSegmentRolesJson(raw, 2)).toThrow();
    });

    it("throws on an unknown role value", () => {
      const raw = JSON.stringify({
        roles: [{ index: 0, role: "villain" }],
      });

      expect(() => parseSegmentRolesJson(raw, 1)).toThrow();
    });

    it("throws on malformed JSON", () => {
      expect(() => parseSegmentRolesJson("not json", 1)).toThrow();
    });
  });
});

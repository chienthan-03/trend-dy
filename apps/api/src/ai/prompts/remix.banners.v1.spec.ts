import { describe, expect, it } from "vitest";
import {
  REMIX_BANNERS_MAX_CHARS,
  REMIX_BANNERS_V1_KEY,
  buildRemixBannersPrompt,
  remixBannersV1ResponseSchema,
  toRemixBannerJson,
} from "./remix.banners.v1";

describe("remix.banners.v1", () => {
  describe("buildRemixBannersPrompt", () => {
    it("includes the key marker, genre, title, and excerpt", () => {
      const { system, user } = buildRemixBannersPrompt({
        transcriptExcerpt: "Xin chào các bạn, hôm nay chúng ta sẽ...",
        title: "Tiêu đề gốc",
        genre: "cultivation",
      });

      expect(user).toContain(`[${REMIX_BANNERS_V1_KEY}]`);
      expect(user).toContain("Thể loại: cultivation");
      expect(user).toContain("Tiêu đề gốc: Tiêu đề gốc");
      expect(user).toContain("Xin chào các bạn");
      expect(system).toContain("banner");
    });

    it("omits optional title/genre lines when not provided", () => {
      const { user } = buildRemixBannersPrompt({
        transcriptExcerpt: "Nội dung transcript.",
      });

      expect(user).not.toContain("Thể loại:");
      expect(user).not.toContain("Tiêu đề gốc:");
    });

    it("truncates long transcript excerpts", () => {
      const longExcerpt = "a".repeat(2000);
      const { user } = buildRemixBannersPrompt({
        transcriptExcerpt: longExcerpt,
      });

      expect(user.length).toBeLessThan(longExcerpt.length);
      expect(user).toContain("…");
    });
  });

  describe("remixBannersV1ResponseSchema", () => {
    it("parses a valid header/bottom pair", () => {
      const parsed = remixBannersV1ResponseSchema.parse({
        header: "KHÔNG THỂ TIN ĐƯỢC",
        bottom: "Theo dõi để xem tiếp",
      });

      expect(parsed).toEqual({
        header: "KHÔNG THỂ TIN ĐƯỢC",
        bottom: "Theo dõi để xem tiếp",
      });
    });

    it("rejects fields longer than the max length", () => {
      expect(() =>
        remixBannersV1ResponseSchema.parse({
          header: "x".repeat(REMIX_BANNERS_MAX_CHARS + 1),
          bottom: "ok",
        }),
      ).toThrow();
    });

    it("allows empty strings for both fields", () => {
      const parsed = remixBannersV1ResponseSchema.parse({
        header: "",
        bottom: "",
      });

      expect(parsed).toEqual({ header: "", bottom: "" });
    });
  });

  describe("toRemixBannerJson", () => {
    it("trims and clamps each field to the max length", () => {
      const result = toRemixBannerJson({
        header: `  ${"a".repeat(50)}  `,
        bottom: "  bottom text  ",
      });

      expect(result.header).toBe("a".repeat(REMIX_BANNERS_MAX_CHARS));
      expect(result.bottom).toBe("bottom text");
    });
  });
});

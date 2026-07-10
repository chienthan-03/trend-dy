import { describe, expect, it } from "vitest";
import {
  collectAliases,
  findCharacterByName,
  normalizeCharacterName,
  type CharacterRecord,
} from "./entity-resolver";

describe("entity-resolver", () => {
  const existing: CharacterRecord[] = [
    { id: "char_1", name: "Lý Minh", aliases: ["Minh"] },
    { id: "char_2", name: "Vương Hoa", aliases: [] },
  ];

  it("normalizes names case-insensitively", () => {
    expect(normalizeCharacterName("  Lý Minh  ")).toBe("lý minh");
    expect(normalizeCharacterName("VƯƠNG HOA")).toBe("vương hoa");
  });

  it("finds characters by canonical name case-insensitively", () => {
    expect(findCharacterByName("lý minh", existing)?.id).toBe("char_1");
    expect(findCharacterByName("LÝ MINH", existing)?.id).toBe("char_1");
  });

  it("finds characters by alias case-insensitively", () => {
    expect(findCharacterByName("minh", existing)?.id).toBe("char_1");
    expect(findCharacterByName("MINH", existing)?.id).toBe("char_1");
  });

  it("merges aliases case-insensitively within story", () => {
    const aliases = collectAliases(existing[0]!, ["Minh", "MINH", "Lý Minh"]);
    expect(aliases).toContain("Minh");
    expect(aliases.filter((a) => normalizeCharacterName(a) === "minh")).toHaveLength(1);
    expect(aliases).not.toContain("Lý Minh");
  });

  it("adds new alias variants without duplicating canonical name", () => {
    const aliases = collectAliases(
      { id: "char_1", name: "John", aliases: [] },
      ["john", "JOHN", "Johnny"],
    );
    expect(aliases).toEqual(["Johnny"]);
  });
});

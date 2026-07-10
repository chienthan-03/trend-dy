export type CharacterRecord = {
  id: string;
  name: string;
  aliases: string[];
};

export const normalizeCharacterName = (name: string): string =>
  name.trim().toLocaleLowerCase();

const matchesName = (candidate: string, value: string): boolean =>
  normalizeCharacterName(candidate) === normalizeCharacterName(value);

export const findCharacterByName = (
  name: string,
  characters: CharacterRecord[],
): CharacterRecord | null => {
  const normalized = normalizeCharacterName(name);
  for (const character of characters) {
    if (matchesName(character.name, name)) {
      return character;
    }
    if (character.aliases.some((alias) => matchesName(alias, name))) {
      return character;
    }
    if (normalizeCharacterName(character.name) === normalized) {
      return character;
    }
  }
  return null;
};

export const collectAliases = (
  character: CharacterRecord,
  incoming: string[],
): string[] => {
  const known = new Set(
    [character.name, ...character.aliases].map(normalizeCharacterName),
  );
  const merged = [...character.aliases];

  for (const alias of incoming) {
    const trimmed = alias.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeCharacterName(trimmed);
    if (known.has(key)) {
      continue;
    }
    known.add(key);
    merged.push(trimmed);
  }

  return merged;
};

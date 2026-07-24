const DIGITS = [
  "không",
  "một",
  "hai",
  "ba",
  "bốn",
  "năm",
  "sáu",
  "bảy",
  "tám",
  "chín",
] as const;

const LATIN_TOKENS: Record<string, string> = {
  ok: "ô kê",
  iphone: "ai phôn",
  algorithm: "algôrít",
  youtube: "iu túp",
  tiktok: "típ tốc",
  facebook: "phét búc",
  ai: "ây ai",
};

const spellOnes = (n: number): string => DIGITS[n] ?? String(n);

const spellUnder100 = (n: number): string => {
  if (n < 10) return spellOnes(n);
  if (n < 20) {
    if (n === 10) return "mười";
    const ones = n % 10;
    if (ones === 5) return "mười lăm";
    if (ones === 1) return "mười một";
    return `mười ${spellOnes(ones)}`;
  }

  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const base = `${spellOnes(tens)} mươi`;
  if (ones === 0) return base;
  if (ones === 1) return `${base} mốt`;
  if (ones === 5) return `${base} lăm`;
  return `${base} ${spellOnes(ones)}`;
};

const spellUnder1000 = (n: number): string => {
  if (n < 100) return spellUnder100(n);

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const base = `${spellOnes(hundreds)} trăm`;
  if (rest === 0) return base;
  if (rest < 10) return `${base} linh ${spellOnes(rest)}`;
  return `${base} ${spellUnder100(rest)}`;
};

const spellInteger = (n: number): string => {
  if (n < 0) return String(n);
  if (n < 1000) return spellUnder1000(n);

  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const base = `${spellUnder1000(thousands)} nghìn`;
  if (rest === 0) return base;
  if (rest < 100) return `${base} không trăm ${spellUnder100(rest)}`;
  return `${base} ${spellUnder1000(rest)}`;
};

const replaceLatinTokens = (text: string): string => {
  let result = text;
  for (const [token, replacement] of Object.entries(LATIN_TOKENS)) {
    const regex = new RegExp(`\\b${token}\\b`, "gi");
    result = result.replace(regex, replacement);
  }
  return result;
};

const collapseSpaces = (text: string): string => text.replace(/\s+/g, " ").trim();

export const normalizeVietnameseForTts = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  let result = replaceLatinTokens(trimmed);

  result = result.replace(/(\d+)\s*%/g, (_, digits: string) => {
    return `${spellInteger(Number.parseInt(digits, 10))} phần trăm`;
  });

  result = result.replace(/\d+/g, (digits) => {
    return spellInteger(Number.parseInt(digits, 10));
  });

  result = result.replace(/%/g, "phần trăm");

  return collapseSpaces(result);
};

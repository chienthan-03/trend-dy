export const secToSrtTimestamp = (sec: number): string => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const remainder = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(remainder, 3)}`;
};

export const buildSrtFromSegments = (
  segments: Array<{ startSec: number; endSec: number; text: string }>,
): string => {
  if (segments.length === 0) return "";
  return `${segments
    .map(
      (seg, i) =>
        `${i + 1}\n${secToSrtTimestamp(seg.startSec)} --> ${secToSrtTimestamp(seg.endSec)}\n${seg.text.trim()}`,
    )
    .join("\n\n")}\n`;
};

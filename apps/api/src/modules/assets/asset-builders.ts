import { voiceScriptToSrt } from "./srt";

export const buildVoiceScript = (script: string): string => script.trim();

export const buildSubtitle = (script: string): string => voiceScriptToSrt(script);

export const buildSceneList = (script: string): string => {
  const paragraphs = script
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const scenes =
    paragraphs.length > 1
      ? paragraphs
      : script
          .split(/(?<=[.!?…])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);

  return scenes
    .map((text, index) => `${index + 1}. ${text}`)
    .join("\n");
};

export const buildBannerText = (script: string): string => {
  const firstLine = script.split(/\n/).find((line) => line.trim())?.trim();
  if (!firstLine) {
    return "";
  }

  const firstSentence =
    firstLine.match(/^[^.!?…]+[.!?…]?/)?.[0]?.trim() ?? firstLine;
  return firstSentence.slice(0, 80);
};

export const buildAssetContent = (
  type: string,
  script: string,
): { body: string; contentType: string; extension: string } => {
  switch (type) {
    case "voice_script":
      return {
        body: buildVoiceScript(script),
        contentType: "text/plain; charset=utf-8",
        extension: "txt",
      };
    case "subtitle":
      return {
        body: buildSubtitle(script),
        contentType: "application/x-subrip; charset=utf-8",
        extension: "srt",
      };
    case "scene_list":
      return {
        body: buildSceneList(script),
        contentType: "text/plain; charset=utf-8",
        extension: "txt",
      };
    case "banner_text":
      return {
        body: buildBannerText(script),
        contentType: "text/plain; charset=utf-8",
        extension: "txt",
      };
    default:
      throw new Error(`Unsupported asset type: ${type}`);
  }
};

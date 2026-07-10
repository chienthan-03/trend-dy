import * as cheerio from "cheerio";

export type FetchUrlResult = {
  text: string;
  rawHtml: string;
};

/**
 * Strip scripts/styles and pull readable text from HTML.
 * Prefers <article>/<main> when present.
 */
export const extractMainText = (html: string): string => {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();

  const root =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("body").length > 0
          ? $("body")
          : $.root();

  return root
    .text()
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

/**
 * Fetch a single URL and extract main text. Caller must ensure license gate.
 */
export const fetchUrlText = async (url: string): Promise<FetchUrlResult> => {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "AI-Content-Factory-Import/1.0",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText ?? ""}`.trim(),
    );
  }

  const rawHtml = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const text = contentType.includes("text/plain")
    ? rawHtml.trim()
    : extractMainText(rawHtml);

  return { text, rawHtml };
};

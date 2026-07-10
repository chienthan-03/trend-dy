import * as cheerio from "cheerio";
import JSZip from "jszip";
import type { ParsedChapter } from "./types";

const resolvePath = (baseDir: string, href: string): string => {
  const cleaned = href.split("#")[0] ?? href;
  if (!baseDir) {
    return cleaned;
  }
  const parts = [...baseDir.split("/").filter(Boolean), ...cleaned.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }
  return resolved.join("/");
};

const htmlToText = (html: string): { title: string; text: string } => {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const title =
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    "Chapter";
  const text = $("body")
    .text()
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
};

/**
 * Lightweight EPUB parser: unzip → read spine from content.opf → extract XHTML text.
 */
export const parseEpub = async (buffer: Buffer): Promise<ParsedChapter[]> => {
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) {
    throw new Error("Invalid EPUB: missing META-INF/container.xml");
  }

  const $container = cheerio.load(containerXml, { xml: true });
  const opfPath = $container("rootfile").attr("full-path");
  if (!opfPath) {
    throw new Error("Invalid EPUB: missing rootfile path");
  }

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) {
    throw new Error(`Invalid EPUB: missing package at ${opfPath}`);
  }

  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/"))
    : "";
  const $opf = cheerio.load(opfXml, { xml: true });

  const idToHref = new Map<string, string>();
  $opf("manifest item").each((_, el) => {
    const id = $opf(el).attr("id");
    const href = $opf(el).attr("href");
    if (id && href) {
      idToHref.set(id, href);
    }
  });

  const hrefs: string[] = [];
  $opf("spine itemref").each((_, el) => {
    const idref = $opf(el).attr("idref");
    if (!idref) {
      return;
    }
    const href = idToHref.get(idref);
    if (href) {
      hrefs.push(href);
    }
  });

  const result: ParsedChapter[] = [];
  for (let i = 0; i < hrefs.length; i++) {
    const href = hrefs[i]!;
    const fullPath = resolvePath(opfDir, href);
    const xhtml = await zip.file(fullPath)?.async("string");
    if (!xhtml) {
      continue;
    }
    const { title, text } = htmlToText(xhtml);
    if (!text.trim()) {
      continue;
    }
    result.push({
      number: result.length + 1,
      title,
      text,
    });
  }

  return result;
};

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DouyinVideoDetail } from "../../douyin-video.adapter";
import { getMediaDownloadTimeoutMs } from "../../remix-config";
import type { DownloadedMedia } from "../../remix-media.adapter";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

export const isYtdlpVideoProvider = (): boolean => {
  const adapter = process.env.DOUYIN_ADAPTER?.trim() || "fake";
  if (adapter === "fake") return false;
  return process.env.DOUYIN_VIDEO_PROVIDER?.trim().toLowerCase() === "ytdlp";
};

export const getYtdlpBin = (): string =>
  process.env.YTDLP_BIN?.trim() || "yt-dlp";

export const buildYtdlpCookieArgs = (): string[] => {
  const args: string[] = [];
  const cookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
  const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (cookiesFile) {
    args.push("--cookies", cookiesFile);
  }
  if (cookiesFromBrowser) {
    args.push("--cookies-from-browser", cookiesFromBrowser);
  }
  return args;
};

export const formatYtdlpAuthHint = (stderr: string): string => {
  if (
    !/login|cookie|private|403|unavailable|Sign in|need .+ cookies/i.test(
      stderr,
    )
  ) {
    return "";
  }
  return (
    " Export Douyin cookies from a logged-in browser (Netscape cookies.txt) " +
    "and set YTDLP_COOKIES_FILE. On Windows, YTDLP_COOKIES_FROM_BROWSER often " +
    "needs the browser closed."
  );
};

export const mapYtdlpJsonToDetail = (
  data: unknown,
  fallbackUrl: string,
): DouyinVideoDetail => {
  const root = asRecord(data) ?? {};
  const idRaw = root.id ?? root.display_id;
  const videoId =
    typeof idRaw === "number" || typeof idRaw === "bigint"
      ? String(idRaw)
      : pickString(idRaw);
  const canonicalUrl =
    pickString(root.webpage_url, root.original_url, root.url) ||
    (videoId && /^\d+$/.test(videoId)
      ? `https://www.douyin.com/video/${videoId}`
      : fallbackUrl);
  const resolvedVideoId =
    /^\d+$/.test(videoId)
      ? videoId
      : pickString(
          canonicalUrl.match(/\/video\/(\d+)/)?.[1],
          fallbackUrl.match(/\/video\/(\d+)/)?.[1],
          videoId,
        );
  const title = pickString(root.title, root.fulltitle);
  const caption = pickString(root.description, root.title);
  const author = pickString(
    root.uploader,
    root.channel,
    root.uploader_id,
    root.creator,
  );
  const timestamp = asNumber(root.timestamp);
  const likes = asNumber(root.like_count) ?? 0;
  const comments = asNumber(root.comment_count) ?? 0;
  const shares =
    asNumber(root.repost_count) ?? asNumber(root.share_count) ?? 0;

  return {
    videoId: resolvedVideoId || videoId || "unknown",
    title: title || caption || `Douyin ${resolvedVideoId || "video"}`,
    caption: caption || title,
    authorHandle: author
      ? author.startsWith("@")
        ? author
        : `@${author}`
      : "@unknown",
    stats: { likes, comments, shares },
    coverUrl: pickString(root.thumbnail, root.thumbnails) || undefined,
    canonicalUrl: canonicalUrl || undefined,
    publishedAt:
      timestamp !== undefined ? new Date(timestamp * 1000) : undefined,
    playUrl: undefined,
    rawPayload: { source: "ytdlp", raw: root },
  };
};

export type YtdlpRunResult = {
  stdout: string;
  stderr: string;
};

export type YtdlpRunner = (
  args: string[],
  options: { timeoutMs: number },
) => Promise<YtdlpRunResult>;

const runYtdlpCli: YtdlpRunner = (args, options) =>
  new Promise((resolvePromise, reject) => {
    const bin = getYtdlpBin();
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(
        new Error(
          `yt-dlp timed out after ${options.timeoutMs}ms (${bin} ${args.slice(0, 4).join(" ")}…)`,
        ),
      );
    }, options.timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `yt-dlp binary not found ("${bin}"). Install yt-dlp and set YTDLP_BIN to the full path.`,
          ),
        );
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const combined = `${stderr}\n${stdout}`.trim();
      reject(
        new Error(
          `yt-dlp exited with code ${code}: ${combined.slice(0, 500)}${formatYtdlpAuthHint(combined)}`,
        ),
      );
    });
  });

const parseYtdlpJson = (stdout: string): unknown => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines.at(-1);
  if (!last) {
    throw new Error("yt-dlp -j returned empty stdout");
  }
  try {
    return JSON.parse(last) as unknown;
  } catch {
    throw new Error(`yt-dlp -j returned invalid JSON: ${last.slice(0, 200)}`);
  }
};

export const fetchYtdlpVideoDetail = async (
  pageUrl: string,
  runner: YtdlpRunner = runYtdlpCli,
): Promise<DouyinVideoDetail> => {
  const timeoutMs = getMediaDownloadTimeoutMs();
  const { stdout } = await runner(
    ["-j", "--no-download", "--no-playlist", ...buildYtdlpCookieArgs(), pageUrl],
    { timeoutMs },
  );
  return mapYtdlpJsonToDetail(parseYtdlpJson(stdout), pageUrl);
};

export const downloadYtdlpVideo = async (
  pageUrl: string,
  runner: YtdlpRunner = runYtdlpCli,
): Promise<DownloadedMedia> => {
  const timeoutMs = getMediaDownloadTimeoutMs();
  const dir = await mkdtemp(join(tmpdir(), "remix-ytdlp-"));
  const outputPath = join(dir, "video.mp4");
  try {
    await runner(
      [
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "-o",
        outputPath,
        ...buildYtdlpCookieArgs(),
        pageUrl,
      ],
      { timeoutMs },
    );
    const buffer = await readFile(outputPath);
    return {
      buffer,
      contentType: "video/mp4",
      sizeBytes: buffer.length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

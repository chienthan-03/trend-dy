# Douyin paste-link via yt-dlp (no Just One) — Design

**Status:** Approved for implementation  
**Date:** 2026-08-21  
**Audience:** Engineering — internal studio tool  
**Depends on:** [Viral Feed & Remix Factory](./2026-07-14-viral-feed-remix-factory.md) Phase B download path  
**Does not change:** Viral Feed ranking boards (still Just One when `DOUYIN_ADAPTER=live`)

---

## 1. Problem

Paste Douyin share URL (`v.douyin.com/…`) currently requires **Just One API** for two calls:

1. `share-url-transfer` → `videoId`
2. video detail → ephemeral CDN `playUrl`

The studio wants the **same paste-link → download → STT → dịch → TTS** path **without** that paid/third-party video API.

Just One is still useful for **ranking boards**. Ranking and paste-link must be independently configurable.

---

## 2. Goals / non-goals

### Goals

- Resolve a Douyin share/canonical URL and download the mp4 **with yt-dlp**, not Just One.
- Support **browser cookies from day one** (`cookies.txt` and/or `--cookies-from-browser`).
- Keep existing job chain: `remix_resolve` → `remix_fetch_detail` → `remix_download_media` → STT…
- Fail with an actionable error when Douyin blocks anonymous yt-dlp (missing/stale cookies).
- Leave ranking (`createDouyinAdapter`) on Just One when live.

### Non-goals

- Replacing Just One ranking/discovery.
- Scraping Douyin HTML in-process (no custom anti-bot).
- Guaranteeing yt-dlp works forever if Douyin changes extractors.
- Changing STT / translate / Piper / render.

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Download tool | **yt-dlp** CLI (already-needed FFmpeg stays as-is) |
| Paste-link video provider | New `DOUYIN_VIDEO_PROVIDER=ytdlp` |
| Ranking provider | Unchanged (`DOUYIN_ADAPTER=live` + Just One) |
| Cookies | Required in practice for Douyin; support **file** and **browser** |
| Identity of the remake | yt-dlp `id` (aweme id) + `webpage_url` |
| Download source | Original `sourceUrl` / canonical Douyin URL — **not** expired CDN `playUrl` |
| Fake/CI | `DOUYIN_ADAPTER=fake` still uses fake video adapter; no yt-dlp |

---

## 4. Environment

```
DOUYIN_ADAPTER=live
DOUYIN_API_PROVIDER=justoneapi
# ranking still uses the token above

# paste-link / remake video (new)
DOUYIN_VIDEO_PROVIDER=ytdlp
YTDLP_BIN=yt-dlp
# Windows example: C:/tools/yt-dlp/yt-dlp.exe

# Cookies — at least one of:
YTDLP_COOKIES_FILE=C:/Publish/mock-duyn/secrets/douyin-cookies.txt
# YTDLP_COOKIES_FROM_BROWSER=chrome
```

Resolution order for the **video** adapter:

1. `DOUYIN_ADAPTER=fake` → fake (tests).
2. Else `DOUYIN_VIDEO_PROVIDER=ytdlp` → yt-dlp adapter.
3. Else `DOUYIN_ADAPTER=live` → current Just One video adapter (backward compatible).

`redownloadMedia` today throws if snapshot has no `playUrl`. In ytdlp mode it must accept `sourceUrl` or snapshot `canonicalUrl` instead.

---

## 5. yt-dlp usage

### Resolve + detail (`remix_resolve` / `remix_fetch_detail`)

One metadata dump:

```
yt-dlp -j --no-download [cookie flags] <shareOrCanonicalUrl>
```

Map JSON → `{ videoId, canonicalUrl }` and `DouyinVideoDetail` (title, caption, thumbnail, duration). `playUrl` may be omitted; download must not depend on it.

### Download (`remix_download_media`)

```
yt-dlp -f bv*+ba/b --merge-output-format mp4 -o <tmp.mp4> [cookie flags] <sourceUrl>
```

Then existing `remixStorage.putVideo` + `extractAudioForStt`.

Cookie flags (append when set):

- `--cookies <YTDLP_COOKIES_FILE>`
- `--cookies-from-browser <YTDLP_COOKIES_FROM_BROWSER>`

If both are set, pass **both** (yt-dlp allows it; file wins for auth if overlapping — document “prefer file”).

If neither is set, still run; on extractor/login errors, message must say to export Douyin cookies (Netscape `cookies.txt` from the logged-in browser) into `YTDLP_COOKIES_FILE`.

Timeouts: reuse `REMIX_MEDIA_DOWNLOAD_TIMEOUT_MS`. Kill the child process on timeout.

---

## 6. Code shape

| Piece | Responsibility |
|---|---|
| `createDouyinVideoAdapter` | Branch on `DOUYIN_VIDEO_PROVIDER` / fake / justone |
| New `ytdlp-video.provider.ts` | Spawn yt-dlp, parse `-j`, cookie args, tmp download |
| New `YtdlpDouyinVideoAdapter` | `resolveShareUrl` + `getVideoDetail` via provider |
| `handleDownloadMedia` | If ytdlp: download via source URL, skip Just One playUrl refresh |
| `redownloadMedia` | Allow missing playUrl when ytdlp + `sourceUrl` present |
| `.env.example` | Document the new vars |

Keep Just One provider files; do not delete.

---

## 7. Risks

- Douyin extractor in yt-dlp **breaks periodically** — ops refresh yt-dlp + cookies, not app code.
- `--cookies-from-browser` on Windows often needs the browser **closed**.
- Cookies contain session secrets — store outside git (`secrets/`, already gitignored if present).
- Ranking **still needs** `DOUYIN_API_TOKEN` until a later change.

---

## 8. Test plan

- Unit: cookie-flag builder; JSON → `DouyinVideoDetail` mapping; adapter factory picks ytdlp vs justone vs fake.
- Unit: `redownloadMedia` does not require `playUrl` when provider is ytdlp and `sourceUrl` exists.
- Processor: download path uses source URL (mock yt-dlp spawn), does not call Just One.
- No live Douyin network in CI.

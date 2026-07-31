# Qwen Timed Bilingual STT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get real Qwen sentence timestamps (ZH review + EN dialogue), merge bilingual cues, translate all to VI, and TTS the same voice on true timeline windows so character lines fill film beds.

**Architecture:** When DashScope timed credentials + public/data file URL are available, call `qwen3-asr-flash-filetrans` (async submit → poll → download `transcription_url`), map `begin_time`/`end_time` ms into `RemixTranscriptV1`, optionally dual-pass `en` and merge. Fall back to today’s OpenRouter plain Qwen path + `timingWarning` when timed path cannot run. Downstream translate/TTS/render stay 1:1 / speak-all / full replace.

**Tech Stack:** NestJS API + BullMQ worker, Vitest, DashScope async ASR (`DASHSCOPE_API_KEY`), existing MinIO/S3 remix storage, `normalizeCueTiming`, translate + remix TTS pipeline

**Spec:** [docs/superpowers/specs/2026-07-31-qwen-timed-bilingual-stt-design.md](../specs/2026-07-31-qwen-timed-bilingual-stt-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/src/modules/remix/remix-config.ts` (+ spec) | Timed STT flags, DashScope base URL, poll limits, merge constants getters |
| `apps/api/src/ai/qwen-timed-stt.types.ts` | DashScope result JSON types |
| `apps/api/src/ai/map-qwen-timed-transcript.ts` (+ spec) | Pure: filetrans result → segments/words/`RemixTranscriptV1` fields |
| `apps/api/src/ai/merge-bilingual-cues.ts` (+ spec) | Pure: merge auto+en cues, IoU dedupe, role heuristic, `language: mixed` |
| `apps/api/src/ai/qwen-timed-stt.client.ts` (+ spec) | Submit/poll/download; resolve `file_url` (public base or data URL) |
| `apps/api/src/ai/stt.ts` (+ spec) | Prefer timed path inside `transcribeAudio`; accept `putTempPublic` / cleanup opts; dual-pass; fallback plain |
| `apps/api/src/workers/processors/remix.processor.ts` (+ full-script spec if needed) | Pass `putTempPublic` from `RemixStorageService.putSttTemp(remakeId, …)` into `transcribeAudio` |
| `apps/api/src/ai/translate.ts` (+ spec) | When copying timings 1:1, also copy `role` / `roleSource` from source segments |
| `.env.example` | Document all timed STT env vars |
| `docs/superpowers/plans/remix-narration-source-mix-smoke-checklist.md` | Add bilingual re-STT smoke row |

**Locked constants** (export from `merge-bilingual-cues.ts` / config):

```ts
export const LATIN_EN_DETECT_RE = /[A-Za-z]{4,}/;
export const MERGE_IOU_DROP = 0.5; // drop weaker cue if overlap IoU ≥ this
// MERGE_TEXT_SIM_DROP deferred — IoU-only dedupe for MVP
```

Export `STT_TEMP_KEY_PREFIX = "stt-temp/"` from `remix-config.ts` (used by storage, not merge).
**DashScope endpoints (intl default; overridable):**

- Submit: `POST {base}/api/v1/services/audio/asr/transcription`
- Query: `GET {base}/api/v1/tasks/{task_id}`
- Headers: `Authorization: Bearer $DASHSCOPE_API_KEY`, `X-DashScope-Async: enable`
- Model: `qwen3-asr-flash-filetrans`
- Body: `{ model, input: { file_url }, parameters: { enable_words: true, enable_itn: false, language?: "en" } }`

**Audio URL constraint:** Filetrans needs a URL DashScope can fetch. Local MinIO `127.0.0.1` is **not** reachable. Resolution order in client:

1. If `REMIX_STT_PUBLIC_BASE_URL` set → put temp object under `stt-temp/` and use `{base}/{key}` (or path-style URL).
2. Else if `REMIX_STT_TIMED_ALLOW_DATA_URL=true` and buffer ≤ `REMIX_STT_TIMED_MAX_DATA_URL_MB` (default 8) → `data:audio/mpeg;base64,...` as `file_url`.
3. Else timed path throws `TimedSttUnavailableError` → `transcribeAudio` falls back to plain OpenRouter path.

---

### Task 1: Config getters

**Files:**
- Modify: `apps/api/src/modules/remix/remix-config.ts`
- Modify: `apps/api/src/modules/remix/remix-config.spec.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing tests**

```ts
it("isTimedSttEnabled requires REMIX_STT_TIMED=true and DASHSCOPE_API_KEY", () => {
  process.env.REMIX_STT_TIMED = "true";
  delete process.env.DASHSCOPE_API_KEY;
  expect(isTimedSttEnabled()).toBe(false);
  process.env.DASHSCOPE_API_KEY = "sk-test";
  expect(isTimedSttEnabled()).toBe(true);
});

it("getDashScopeBaseUrl defaults to intl endpoint", () => {
  delete process.env.DASHSCOPE_BASE_URL;
  expect(getDashScopeBaseUrl()).toBe("https://dashscope-intl.aliyuncs.com");
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/api && npx vitest run src/modules/remix/remix-config.spec.ts -t "isTimedSttEnabled"`

Expected: FAIL (exports missing)

- [ ] **Step 3: Implement getters**

Add:

```ts
export const isTimedSttEnabled = (): boolean =>
  process.env.REMIX_STT_TIMED?.trim().toLowerCase() === "true" &&
  Boolean(process.env.DASHSCOPE_API_KEY?.trim());

export const getDashScopeApiKey = (): string =>
  process.env.DASHSCOPE_API_KEY?.trim() ?? "";

export const getDashScopeBaseUrl = (): string =>
  (process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com").replace(
    /\/$/,
    "",
  );

export const getTimedSttModel = (): string =>
  process.env.REMIX_STT_TIMED_MODEL?.trim() || "qwen3-asr-flash-filetrans";

export const getSttPublicBaseUrl = (): string | undefined => {
  const raw = process.env.REMIX_STT_PUBLIC_BASE_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : undefined;
};

export const isTimedSttDataUrlAllowed = (): boolean =>
  process.env.REMIX_STT_TIMED_ALLOW_DATA_URL?.trim().toLowerCase() === "true";

export const getTimedSttMaxDataUrlMb = (): number => {
  const n = Number(process.env.REMIX_STT_TIMED_MAX_DATA_URL_MB ?? "8");
  return Number.isFinite(n) && n > 0 ? n : 8;
};

export const getTimedSttPollIntervalMs = (): number => {
  const n = Number(process.env.REMIX_STT_TIMED_POLL_MS ?? "2000");
  return Number.isFinite(n) && n >= 500 ? n : 2000;
};

export const getTimedSttPollTimeoutMs = (): number => {
  const n = Number(process.env.REMIX_STT_TIMED_POLL_TIMEOUT_MS ?? "600000");
  return Number.isFinite(n) && n >= 10_000 ? n : 600_000;
};
```

In `.env.example` add (commented defaults OK):

```bash
# Timed bilingual STT (DashScope filetrans) — falls back to OpenRouter plain Qwen if unset/unavailable
# DASHSCOPE_API_KEY=
# DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com
# REMIX_STT_TIMED=true
# REMIX_STT_TIMED_MODEL=qwen3-asr-flash-filetrans
# REMIX_STT_PUBLIC_BASE_URL=https://your-public-minio-or-cdn.example/factory
# REMIX_STT_TIMED_ALLOW_DATA_URL=false
# REMIX_STT_TIMED_MAX_DATA_URL_MB=8
# REMIX_STT_TIMED_POLL_MS=2000
# REMIX_STT_TIMED_POLL_TIMEOUT_MS=600000
# Leave REMIX_STT_LANGUAGE empty for auto (do not force zh on bilingual clips)
# REMIX_STT_LANGUAGE=
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/api && npx vitest run src/modules/remix/remix-config.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/remix-config.ts apps/api/src/modules/remix/remix-config.spec.ts .env.example
git commit -m "feat(api): add DashScope timed STT config gates"
```

---

### Task 2: Map filetrans JSON → transcript pieces

**Files:**
- Create: `apps/api/src/ai/qwen-timed-stt.types.ts`
- Create: `apps/api/src/ai/map-qwen-timed-transcript.ts`
- Create: `apps/api/src/ai/map-qwen-timed-transcript.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { mapQwenTimedFileResult } from "./map-qwen-timed-transcript";

describe("mapQwenTimedFileResult", () => {
  it("maps sentence ms to startSec/endSec and flattens words", () => {
    const mapped = mapQwenTimedFileResult(
      {
        transcripts: [
          {
            channel_id: 0,
            text: "Hello. 你好。",
            sentences: [
              {
                sentence_id: 0,
                begin_time: 240,
                end_time: 2000,
                language: "en",
                text: "Hello.",
                words: [
                  { begin_time: 240, end_time: 800, text: "Hello", punctuation: "." },
                ],
              },
              {
                sentence_id: 1,
                begin_time: 5000,
                end_time: 7000,
                language: "zh",
                text: "你好。",
              },
            ],
          },
        ],
      },
      { timeOffsetSec: 10, model: "qwen3-asr-flash-filetrans", provider: "dashscope" },
    );

    expect(mapped.segments[0]).toMatchObject({
      startSec: 10.24,
      endSec: 12,
      text: "Hello.",
    });
    expect(mapped.segments[1]).toMatchObject({
      startSec: 15,
      endSec: 17,
      text: "你好。",
    });
    expect(mapped.words?.[0]).toMatchObject({
      startSec: 10.24,
      endSec: 10.8,
      text: "Hello.",
    });
    expect(mapped.fullText.length).toBeGreaterThan(0);
  });

  it("skips empty sentence text", () => {
    const mapped = mapQwenTimedFileResult(
      {
        transcripts: [
          {
            channel_id: 0,
            text: "",
            sentences: [{ sentence_id: 0, begin_time: 0, end_time: 1000, text: "  " }],
          },
        ],
      },
      { timeOffsetSec: 0, model: "m", provider: "dashscope" },
    );
    expect(mapped.segments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && npx vitest run src/ai/map-qwen-timed-transcript.spec.ts`

- [ ] **Step 3: Implement mapper**

```ts
const msToSec = (ms: number, offsetSec: number) =>
  Math.round((ms / 1000 + offsetSec) * 100) / 100;

export const mapQwenTimedFileResult = (
  result: QwenTimedFileResult,
  opts: { timeOffsetSec: number; model: string; provider: string },
): {
  segments: Array<{ startSec: number; endSec: number; text: string; language?: string }>;
  words: RemixTranscriptWord[];
  fullText: string;
  durationSec: number;
} => {
  const sentences = result.transcripts?.[0]?.sentences ?? [];
  const segments = [];
  const words = [];
  for (const sentence of sentences) {
    const text = sentence.text?.trim() ?? "";
    if (!text) continue;
    const startSec = msToSec(sentence.begin_time, opts.timeOffsetSec);
    const endSec = Math.max(msToSec(sentence.end_time, opts.timeOffsetSec), startSec + 0.05);
    segments.push({
      startSec,
      endSec,
      text,
      ...(sentence.language ? { language: sentence.language } : {}),
    });
    for (const word of sentence.words ?? []) {
      const wText = `${word.text ?? ""}${word.punctuation ?? ""}`.trim();
      if (!wText) continue;
      const wStart = msToSec(word.begin_time, opts.timeOffsetSec);
      const wEnd = Math.max(msToSec(word.end_time, opts.timeOffsetSec), wStart + 0.01);
      words.push({ startSec: wStart, endSec: wEnd, text: wText });
    }
  }
  const fullText =
    result.transcripts?.[0]?.text?.trim() || segments.map((s) => s.text).join("");
  const durationSec =
    segments.length > 0 ? segments[segments.length - 1]!.endSec : opts.timeOffsetSec;
  return { segments, words, fullText, durationSec };
};
```

Types in `qwen-timed-stt.types.ts` matching DashScope result schema (`begin_time`/`end_time` integers ms).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/qwen-timed-stt.types.ts apps/api/src/ai/map-qwen-timed-transcript.ts apps/api/src/ai/map-qwen-timed-transcript.spec.ts
git commit -m "feat(api): map Qwen filetrans timed sentences to cues"
```

---

### Task 3: Bilingual merge + role heuristic

**Files:**
- Create: `apps/api/src/ai/merge-bilingual-cues.ts`
- Create: `apps/api/src/ai/merge-bilingual-cues.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("hasLatinDialogueCue", () => {
  it("is true when any segment has 4+ Latin letters", () => {
    expect(hasLatinDialogueCue([{ text: "Hello there" }])).toBe(true);
    expect(hasLatinDialogueCue([{ text: "路人见他眼神犀利" }])).toBe(false);
  });
});

describe("mergeBilingualCues", () => {
  it("orders by startSec and prefers EN-pass cue on high IoU overlap", () => {
    const merged = mergeBilingualCues({
      primary: [
        { startSec: 0, endSec: 2, text: "旁白。", pass: "auto" },
        { startSec: 5, endSec: 8, text: "noise", pass: "auto" },
      ],
      secondaryEn: [
        { startSec: 5.1, endSec: 7.9, text: "Where is he?", pass: "en" },
      ],
    });
    expect(merged.map((c) => c.text)).toEqual(["旁白。", "Where is he?"]);
  });

  it("tags roles and sets language mixed when both scripts present", () => {
    const { cues, language } = mergeBilingualCuesWithMeta({
      primary: [{ startSec: 0, endSec: 2, text: "旁白一句。", pass: "auto" }],
      secondaryEn: [{ startSec: 3, endSec: 5, text: "Thank you.", pass: "en" }],
    });
    expect(language).toBe("mixed");
    expect(cues[0]?.role).toBe("narration");
    expect(cues[1]?.role).toBe("source");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && npx vitest run src/ai/merge-bilingual-cues.spec.ts`

- [ ] **Step 3: Implement**

- `hasLatinDialogueCue(segments)` → `LATIN_EN_DETECT_RE.test(text)`
- `cueIoU(a,b)` = intersection / union of `[start,end]`
- Merge algorithm:
  1. Tag each cue with `pass: "auto" | "en"`.
  2. Sort all by `startSec`, then `endSec`.
  3. Greedy: walk sorted; if next overlaps previous with IoU ≥ `MERGE_IOU_DROP`, keep the `en` pass cue (or keep previous if already `en`).
  4. `heuristicRole(text)`: if `LATIN_EN_DETECT_RE` and CJK char count < Latin letter count → `source`, else `narration`.
  5. `language`: `"mixed"` if any narration-like and any source-like; else majority / `"zh"` / `"en"`.

Attach `role: "narration" | "source"` and `roleSource: "auto"` on output segments (compatible with `RemixTranscriptSegment`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/merge-bilingual-cues.ts apps/api/src/ai/merge-bilingual-cues.spec.ts
git commit -m "feat(api): merge bilingual STT cues with EN overlap preference"
```

---

### Task 4: DashScope timed client (mock fetch)

**Files:**
- Create: `apps/api/src/ai/qwen-timed-stt.client.ts`
- Create: `apps/api/src/ai/qwen-timed-stt.client.spec.ts`
- Modify: `apps/api/src/modules/remix/remix-storage.service.ts` (optional `putSttTemp` + delete) **or** keep temp put inside client via injected storage callbacks to avoid circular deps — prefer **client accepts `resolveFileUrl: (buf) => Promise<string>`** so storage wiring stays in `stt.ts`.

- [ ] **Step 1: Write failing tests with mocked `global.fetch`**

```ts
it("submits, polls SUCCEEDED, downloads transcription JSON", async () => {
  const calls: string[] = [];
  global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/transcription")) {
      return new Response(JSON.stringify({ output: { task_id: "t1" } }), { status: 200 });
    }
    if (url.includes("/tasks/t1")) {
      return new Response(
        JSON.stringify({
          output: {
            task_id: "t1",
            task_status: "SUCCEEDED",
            result: { transcription_url: "https://example.test/result.json" },
          },
          usage: { seconds: 12 },
        }),
        { status: 200 },
      );
    }
    if (url.includes("result.json")) {
      return new Response(
        JSON.stringify({
          transcripts: [
            {
              channel_id: 0,
              text: "Hi",
              sentences: [{ sentence_id: 0, begin_time: 0, end_time: 1000, text: "Hi" }],
            },
          ],
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;

  const result = await transcribeQwenTimed({
    fileUrl: "https://cdn.example/a.mp3",
    language: undefined,
  });
  expect(result.usageSeconds).toBe(12);
  expect(result.fileResult.transcripts[0]?.sentences[0]?.text).toBe("Hi");
});
```

Also test: poll `FAILED` throws; poll timeout throws.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `transcribeQwenTimed`**

```ts
export const transcribeQwenTimed = async (input: {
  fileUrl: string;
  language?: "en" | "zh";
}): Promise<{ fileResult: QwenTimedFileResult; usageSeconds: number; model: string }> => {
  // POST submit with enable_words: true
  // loop GET task until SUCCEEDED | FAILED | timeout
  // GET transcription_url JSON
  // return { fileResult, usageSeconds, model: getTimedSttModel() }
};
```

Use `getDashScopeApiKey`, `getDashScopeBaseUrl`, poll interval/timeout from config. Log via existing `logGatewayCall` with `kind: "stt"`, `type: "remix_stt_timed"`.

- [ ] **Step 4: Implement `resolveTimedSttFileUrl` in same file or `stt-file-url.ts`**

```ts
export const resolveTimedSttFileUrl = async (input: {
  audioBuffer: Buffer;
  putTempPublic?: (buffer: Buffer) => Promise<string>; // returns https URL
}): Promise<string> => {
  if (input.putTempPublic && getSttPublicBaseUrl()) {
    return input.putTempPublic(input.audioBuffer);
  }
  const maxBytes = getTimedSttMaxDataUrlMb() * 1024 * 1024;
  if (isTimedSttDataUrlAllowed() && input.audioBuffer.length <= maxBytes) {
    return `data:audio/mpeg;base64,${input.audioBuffer.toString("base64")}`;
  }
  throw new TimedSttUnavailableError(
    "Timed STT needs REMIX_STT_PUBLIC_BASE_URL or REMIX_STT_TIMED_ALLOW_DATA_URL",
  );
};
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ai/qwen-timed-stt.client.ts apps/api/src/ai/qwen-timed-stt.client.spec.ts
git commit -m "feat(api): DashScope Qwen filetrans timed STT client"
```

---

### Task 5: Wire `putSttTemp` on remix storage + public URL

**Files:**
- Modify: `apps/api/src/modules/remix/remix-storage.service.ts`
- Modify: `apps/api/src/modules/remix/remix-storage.service.spec.ts` (if present; else skip and cover via stt integration)

- [ ] **Step 1: Add methods**

```ts
async putSttTemp(remakeIdOrJob: string, buffer: Buffer): Promise<string> {
  const key = `${STT_TEMP_KEY_PREFIX}${remakeIdOrJob}/${Date.now()}.mp3`;
  await this.putObject(key, buffer, "audio/mpeg");
  const base = getSttPublicBaseUrl();
  if (!base) throw new Error("REMIX_STT_PUBLIC_BASE_URL required for temp public STT URL");
  return `${base}/${key}`; // document path-style vs virtual-host in .env.example
}

async deleteSttTempByUrl(url: string): Promise<void> {
  // no-op for data: URLs; only delete when url starts with getSttPublicBaseUrl()
}
```

Only needed when public base is configured. For data-URL mode, skip storage. Cleanup is invoked from Task 6 `finally` via `deleteTempPublic`.

- [ ] **Step 2: Unit-test URL construction with mocked put**

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/remix/remix-storage.service.ts
git commit -m "feat(api): temp public STT object URL for DashScope fetch"
```

---

### Task 6: Orchestrate timed path inside `transcribeAudio` + processor wiring

**Files:**
- Modify: `apps/api/src/ai/stt.ts`
- Modify: `apps/api/src/ai/stt.spec.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` (mock storage; assert `transcribeAudio` called with `putTempPublic`)

- [ ] **Step 1: Write failing tests**

1. When `isTimedSttEnabled()` false → existing plain path unchanged (spy `transcribeWithOpenAi` / fake).
2. When timed enabled: mock `resolveTimedSttFileUrl` + `transcribeQwenTimed` → `normalizeCueTiming` receives real gaps; `timingDegraded` false.
3. When primary has no Latin cues: second `transcribeQwenTimed({ language: "en" })` called; merge used.
4. When EN second pass throws or still no Latin after merge attempt: primary-only result + `timingWarning`-class signal — extend `TranscribeAudioResult` with optional `sttWarning?: string` (e.g. `"EN dialogue pass failed — ZH-only timed cues"`) **or** fold into existing coarse warning string that processor already persists as `timingWarning`. Prefer appending to the string processor writes when `timingDegraded || timingCoarse || sttWarning`.
5. When timed throws: falls back to plain path and result has `timingDegraded: true`.
6. `resolveTimedSttFileUrl` receives `putTempPublic` from opts when provided.

Use `vi.mock` for client modules.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Extend `transcribeAudio` signature**

```ts
export type TranscribeAudioOpts = {
  languageHint?: string;
  /** Returns a DashScope-fetchable HTTPS URL for this buffer (temp object). */
  putTempPublic?: (buffer: Buffer) => Promise<string>;
  /** Best-effort cleanup after timed STT (ignore errors). */
  deleteTempPublic?: (url: string) => Promise<void>;
};

export const transcribeAudio = async (
  audioBuffer: Buffer,
  opts?: TranscribeAudioOpts,
): Promise<TranscribeAudioResult> => { ... };
```

- [ ] **Step 4: Implement orchestration**

Pseudo:

```ts
if (isFakeSttMode()) { /* unchanged */ }

if (isTimedSttEnabled()) {
  let fileUrl: string | undefined;
  try {
    const prepared = audioBuffer; // prefer original; compress only if data-URL size requires it
    fileUrl = await resolveTimedSttFileUrl({
      audioBuffer: prepared,
      putTempPublic: opts?.putTempPublic,
    });
    const primary = await transcribeQwenTimed({ fileUrl, language: undefined });
    let mapped = mapQwenTimedFileResult(primary.fileResult, { timeOffsetSec: 0, ... });
    let sttWarning: string | undefined;
    let dualPass = false;

    if (!hasLatinDialogueCue(mapped.segments)) {
      try {
        const en = await transcribeQwenTimed({ fileUrl, language: "en" });
        const enMapped = mapQwenTimedFileResult(en.fileResult, { timeOffsetSec: 0, ... });
        const merged = mergeBilingualCuesWithMeta({
          primary: mapped.segments.map(...),
          secondaryEn: enMapped.segments.map(...),
        });
        mapped = { ...mapped, segments: merged.cues, words: ..., language: merged.language };
        dualPass = true;
        if (!hasLatinDialogueCue(mapped.segments)) {
          sttWarning = "EN dialogue under-captured after dual-pass — timed ZH-only cues";
        }
      } catch {
        sttWarning = "EN dialogue pass failed — timed ZH-only cues";
      }
    }

    const normalized = normalizeCueTiming({ ... });
    // build transcript with roles; provider dashscope; return timing flags + sttWarning
    return { transcript, costUsd, timingDegraded, timingCoarse, sttWarning };
  } catch (err) {
    // log; fall through to plain OpenRouter path
  } finally {
    if (fileUrl) await opts?.deleteTempPublic?.(fileUrl).catch(() => undefined);
  }
}

// existing compress + OpenAI/OpenRouter plain path
```

**Do not** force `getSttLanguageHint()` into timed auto pass. For plain fallback, keep current hint behavior.

**Chunking (locked for MVP):** Run the `isTimedSttEnabled()` branch **before** the existing duration/`transcribeChunkedMp3` gates so long files stay on single-file timed STT. DashScope `qwen3-asr-flash-filetrans` accepts long files (up to ~12h per Aliyun docs). Plain fallback keeps existing chunking. If a future remake hits provider limits, add timed chunking as follow-up.

**costUsd:** Sum `usage.seconds` from each DashScope call (primary + optional EN) × `getSttCostPerMinuteUsd()` (or `REMIX_STT_TIMED_COST_PER_MINUTE_USD` if set).

- [ ] **Step 5: Wire processor `handleStt`**

In `remix.processor.ts` `handleStt`:

```ts
const { transcript, costUsd, timingDegraded, timingCoarse, sttWarning } =
  await transcribeAudio(audioBuffer, {
    languageHint: getSttLanguageHint(),
    putTempPublic: (buffer) => this.remixStorage.putSttTemp(remakeId, buffer),
    deleteTempPublic: (url) => this.remixStorage.deleteSttTempByUrl(url),
  });

const timingWarning =
  timingDegraded || timingCoarse || sttWarning
    ? [timingDegraded || timingCoarse
        ? "Timeline cue còn thô hoặc ước lượng — nên Transcribe lại / kiểm tra sync."
        : null,
      sttWarning ?? null]
        .filter(Boolean)
        .join(" ")
    : null;
```

Add/adjust full-script STT test: when timed path mocked, ensure opts include functions (or spy `putSttTemp` not required if timed disabled in test env).

- [ ] **Step 6: Run `stt.spec.ts` + processor STT-related tests — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai/stt.ts apps/api/src/ai/stt.spec.ts \
  apps/api/src/workers/processors/remix.processor.ts \
  apps/api/src/workers/processors/remix.processor.full-script.spec.ts
git commit -m "feat(api): prefer Qwen timed bilingual STT with plain fallback"
```

---

### Task 6b: Preserve roles through translate timing lock

**Files:**
- Modify: `apps/api/src/ai/translate.ts` (the loop that copies `startSec`/`endSec` — also copy `role` / `roleSource` when present on source)
- Modify: `apps/api/src/ai/translate.spec.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.ts` if timing copy lives only there — **prefer one place**: processor already copies timings; extend that loop to copy roles too (check which is source of truth today and update both if duplicated).

- [ ] **Step 1: Failing test** — source segment with `role: "source"` survives translate output at same index.

- [ ] **Step 2: Implement copy**

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ai/translate.ts apps/api/src/ai/translate.spec.ts apps/api/src/workers/processors/remix.processor.ts
git commit -m "fix(api): copy segment roles with translate timing lock"
```

---

### Task 7: Cost estimate + gateway log fields

**Files:**
- Modify: `apps/api/src/modules/remix/remix-cost-estimate.ts` (+ spec if needed)
- Ensure timed path logs include `timed: true`, `dualPass`, `provider: dashscope`

- [ ] **Step 1:** If cost estimate assumes OpenRouter Qwen rate only, add note or branch for filetrans duration billing (usage.seconds × same or env `REMIX_STT_TIMED_COST_PER_MINUTE_USD` defaulting to existing Qwen rate).

- [ ] **Step 2:** Tests for estimate still return a finite number when timed model id is set.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/remix/remix-cost-estimate.ts apps/api/src/modules/remix/remix-cost-estimate.spec.ts
git commit -m "feat(api): cost/log support for DashScope timed STT"
```

---

### Task 8: Smoke checklist + operator notes

**Files:**
- Modify: `docs/superpowers/plans/remix-narration-source-mix-smoke-checklist.md`
- Optionally short note under remake UI is **out of scope** (warning already exists via `timingWarning`)

- [ ] **Step 1: Add checklist rows**

| # | Action | Expect |
|---|--------|--------|
| T1 | Set `DASHSCOPE_API_KEY`, `REMIX_STT_TIMED=true`, public base **or** data URL allow; clear `REMIX_STT_LANGUAGE` | Worker boots; timed path logs appear |
| T2 | Remake *quán rượu* → **Transcribe lại** | Cues not constant CPS; some EN/`source` or Latin-origin lines; gaps between review islands |
| T3 | Translate → **Tạo audio VI** → listen | Review → character VI → review; same voice |
| T4 | Unset DashScope key / timed=false | STT still works via OpenRouter; `timingWarning` if proportional |

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/remix-narration-source-mix-smoke-checklist.md
git commit -m "docs: smoke checklist for Qwen timed bilingual STT"
```

---

### Task 9: Verification gate

- [ ] **Step 1: Run focused suites**

```bash
cd apps/api && npx vitest run \
  src/modules/remix/remix-config.spec.ts \
  src/ai/map-qwen-timed-transcript.spec.ts \
  src/ai/merge-bilingual-cues.spec.ts \
  src/ai/qwen-timed-stt.client.spec.ts \
  src/ai/stt.spec.ts
```

Expected: all PASS

- [ ] **Step 2: Manual (when credentials available)** — checklist T2–T3 on remake `cmrocikn6000gvsicqdw9uxhp`

- [ ] **Step 3: Final commit only if docs/code dirty from verification fixes**

---

## Out of scope (do not implement in this plan)

- Whisper / forced aligner
- Restore original-audio mix / duck-by-role render
- Distinct character TTS voice
- Changing translate prompts beyond copying `role` / `roleSource` with timings
- UI redesign beyond existing `timingWarning`

## Execution notes for agents

- Prefer TDD order exactly as tasks list.
- Never commit `.env` secrets; only `.env.example`.
- If DashScope intl endpoint fails in CN regions, set `DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com`.
- Data URL mode may hit request size limits — prefer `REMIX_STT_PUBLIC_BASE_URL` in shared/dev tunnels for long videos.

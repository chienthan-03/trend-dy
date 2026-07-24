# Local Piper TTS (Ngọc Huyền) Dual Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free local Piper TTS engine (Ngọc Huyền mới) selectable alongside OpenRouter/Grok, with VI text normalization and smart cue batching that avoids mid-word ratio cuts.

**Architecture:** Engine strategy inside existing `handleTts`: resolve `piper | live | fake` from job payload → remake.`ttsEngine` → `REMIX_TTS_MODE`. Piper uses `viet-normalize` + smart-batch + `PiperTtsAdapter` (CLI → wav → mp3, `$0`). Live keeps ratio-batch + `HttpTtsAdapter`. Fit/assemble/MinIO/render unchanged. UI shows persisted engine or env default; never silently reverts to Live.

**Tech Stack:** NestJS, BullMQ, Prisma, Vitest, Piper CLI, FFmpeg, Next.js Remake Studio

**Spec:** [docs/superpowers/specs/2026-07-24-local-piper-tts-design.md](../specs/2026-07-24-local-piper-tts-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/models/tts/ngoc-huyen/README.md` | How to copy `.onnx` + `.onnx.json`; license note |
| `apps/api/models/tts/ngoc-huyen/*.onnx` | Weights — **gitignored** |
| `apps/api/models/tts/ngoc-huyen/*.onnx.json` | Piper config — **commit** if redistributable; else document copy |
| `.gitignore` | Ignore `*.onnx` under `apps/api/models/tts/` |
| `apps/api/src/modules/remix/remix-config.ts` | `TtsEngine`, `resolveTtsEngine`, Piper path helpers, smart-batch env |
| `apps/api/src/modules/remix/tts/viet-normalize.ts` | Rule-based VI normalizer (MVP; swap-ready) |
| `apps/api/src/modules/remix/tts/viet-normalize.spec.ts` | Normalizer unit tests |
| `apps/api/src/modules/remix/tts/piper-tts.adapter.ts` | Spawn Piper CLI → wav → mp3 |
| `apps/api/src/modules/remix/tts/piper-tts.adapter.spec.ts` | Fake-CLI tests + optional `PIPER_INTEGRATION=1` |
| `apps/api/src/modules/remix/tts/smart-batch-cues.ts` | Merge by gap/sentence caps; split at cue boundaries |
| `apps/api/src/modules/remix/tts/smart-batch-cues.spec.ts` | Merge/split unit tests |
| `apps/api/src/modules/remix/tts/tts.adapter.ts` | `createTtsAdapter(engine)` → fake / http / piper |
| `apps/api/src/modules/remix/tts/tts-batch-cache.ts` | Cache key includes `engine` |
| `apps/api/src/workers/processors/remix.processor.ts` | Choose prep+batch+adapter by engine |
| `apps/api/src/modules/remix/remix.service.ts` | `enqueueTts({ engine, voiceId })`; persist `ttsEngine` |
| `apps/api/src/modules/remix/remix.controller.ts` | Accept `engine` on POST `:id/tts` |
| `apps/api/src/modules/remix/remix-cost-estimate.ts` | Piper / non-live → `$0` with clear detail |
| `prisma/schema.prisma` + migration | `ttsEngine String?` |
| `apps/web/src/lib/api-client.ts` | `ttsEngine`, `enqueueTts({ engine })`, cost types |
| `apps/web/src/components/remix/video-output-panel.tsx` | Engine toggle; voice select only for live |
| `.env.example` | `REMIX_TTS_MODE=piper`, `REMIX_PIPER_*` |

**Locked defaults (MVP):**

```ts
// smart batch (piper)
REMIX_TTS_SMART_BATCH_MAX_GAP_SEC = 0.6
REMIX_TTS_SMART_BATCH_MAX_DURATION_SEC = 12
REMIX_TTS_SMART_BATCH_MAX_CHARS = 500

// piper paths
REMIX_PIPER_BIN = "piper" // or piper.exe on PATH
REMIX_PIPER_MODEL_DIR = "<repo>/apps/api/models/tts/ngoc-huyen"
// model files: "Ngọc Huyền (mới).onnx" + ".onnx.json"
```

**Normalizer choice:** Vendored rule-based `viet-normalize.ts` in-repo (numbers, `%`, currency-ish tokens, simple Latin → syllable spelling). No new npm dep in MVP; structure allows swapping to a fuller lib later.

**Smart split choice:** MVP uses **cumulative cue-window weight slices at merged cue boundaries only** (reuse `allocateBatchSliceRanges` idea). Optional ffmpeg `silencedetect` snap is **out of MVP** (follow-up) — document in smart-batch file header.

**Windows paths:** Always pass model/bin paths as **spawn argv elements** (no shell join); resolve absolute paths with `path.resolve`.

---

### Task 1: Config + model dir scaffolding

**Files:**
- Modify: `.gitignore`
- Create: `apps/api/models/tts/ngoc-huyen/README.md`
- Modify: `apps/api/src/modules/remix/remix-config.ts`
- Modify: `apps/api/src/modules/remix/remix-config.spec.ts`
- Modify: `.env.example`

- [ ] **Step 1: Gitignore + README**

Add to `.gitignore`:

```
apps/api/models/tts/**/*.onnx
```

Create `apps/api/models/tts/ngoc-huyen/README.md` explaining: copy `Ngọc Huyền (mới).onnx` + `.onnx.json` here; NGHI-TTS ecosystem license gate; no runtime download.

- [ ] **Step 2: Extend remix-config**

```ts
export type TtsEngine = "fake" | "live" | "piper";

/** Env-only default (UI may override via remake.ttsEngine). */
export const getTtsMode = (): TtsEngine => {
  const raw = process.env.REMIX_TTS_MODE?.trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "piper" || raw === "local") return "piper";
  return "fake";
};

export const resolveTtsEngine = (input?: {
  payloadEngine?: string | null;
  remakeEngine?: string | null;
}): TtsEngine => {
  const fromPayload = normalizeEngine(input?.payloadEngine);
  if (fromPayload) return fromPayload;
  const fromRemake = normalizeEngine(input?.remakeEngine);
  if (fromRemake) return fromRemake;
  return getTtsMode();
};

const normalizeEngine = (value?: string | null): TtsEngine | null => {
  const raw = value?.trim().toLowerCase();
  if (raw === "live" || raw === "piper" || raw === "fake") return raw;
  if (raw === "local") return "piper";
  return null;
};

export const getPiperBin = (): string =>
  process.env.REMIX_PIPER_BIN?.trim() || "piper";

export const getPiperModelDir = (): string => {
  const configured = process.env.REMIX_PIPER_MODEL_DIR?.trim();
  if (configured) return configured;
  // Must work when worker cwd is monorepo root OR apps/api:
  // try join(cwd, "apps/api/models/tts/ngoc-huyen"), then
  // join(cwd, "models/tts/ngoc-huyen"), return first existing dir
  // (absolute path). Document REMIX_PIPER_MODEL_DIR in .env.example as override.
  return resolveDefaultPiperModelDir();
};

export const getPiperModelStem = (): string =>
  process.env.REMIX_PIPER_MODEL_STEM?.trim() || "Ngọc Huyền (mới)";

export const getSmartBatchMaxGapSec = (): number => { /* default 0.6 */ };
export const getSmartBatchMaxDurationSec = (): number => { /* default 12 */ };
export const getSmartBatchMaxChars = (): number => { /* default 500 */ };
```

Update tests: `getTtsMode()` accepts `piper`; `resolveTtsEngine` precedence payload > remake > env.

- [ ] **Step 3: `.env.example`**

Document `REMIX_TTS_MODE=piper|live|fake`, `REMIX_PIPER_BIN`, `REMIX_PIPER_MODEL_DIR`, smart-batch envs.

- [ ] **Step 4: Commit**

```bash
git add .gitignore apps/api/models/tts/ngoc-huyen/README.md \
  apps/api/src/modules/remix/remix-config.ts \
  apps/api/src/modules/remix/remix-config.spec.ts .env.example
git commit -m "feat(remix): add piper TTS engine config and model dir scaffold"
```

---

### Task 2: Prisma `ttsEngine`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `pnpm --filter api exec prisma migrate dev` (or repo’s usual command)
- Modify: shared types / DTO if remake select lists columns explicitly

- [ ] **Step 1: Schema**

```prisma
ttsEngine  String?  @map("tts_engine") // piper | live
```

Place near `ttsVoiceId`.

- [ ] **Step 2: Migrate**

Run project migrate command; verify column exists.

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat(remix): add ViralRemake.ttsEngine column"
```

---

### Task 3: `viet-normalize` (TDD)

**Files:**
- Create: `apps/api/src/modules/remix/tts/viet-normalize.ts`
- Create: `apps/api/src/modules/remix/tts/viet-normalize.spec.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeVietnameseForTts } from "./viet-normalize";

describe("normalizeVietnameseForTts", () => {
  it("expands integers and percents", () => {
    expect(normalizeVietnameseForTts("Giảm 50% còn 3 ngày")).toMatch(/phần trăm/);
    expect(normalizeVietnameseForTts("năm 2024")).toMatch(/hai nghìn|không|2024/);
  });

  it("phoneticizes common Latin tokens", () => {
    const out = normalizeVietnameseForTts("algorithm và iPhone");
    expect(out.toLowerCase()).not.toContain("algorithm");
  });

  it("returns trimmed empty for blank input", () => {
    expect(normalizeVietnameseForTts("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/api && npx vitest run src/modules/remix/tts/viet-normalize.spec.ts
```

- [ ] **Step 3: Implement MVP rules**

Export `normalizeVietnameseForTts(text: string): string`. Cover: trim, collapse spaces, `%` → `phần trăm`, digit groups → VI number words (simple), small Latin map (`ok`, `iphone`, `algorithm`, `youtube`, `tiktok`, `facebook`, `ai`). Keep pure (no I/O).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/tts/viet-normalize.ts \
  apps/api/src/modules/remix/tts/viet-normalize.spec.ts
git commit -m "feat(remix): add Vietnamese TTS text normalizer"
```

---

### Task 4: `PiperTtsAdapter` (TDD + fake CLI)

**Files:**
- Create: `apps/api/src/modules/remix/tts/piper-tts.adapter.ts`
- Create: `apps/api/src/modules/remix/tts/piper-tts.adapter.spec.ts`
- Modify: `apps/api/src/modules/remix/tts/tts.adapter.ts`
- Modify: `apps/api/src/modules/remix/tts/tts.adapter.spec.ts` (add `piper` engine case / signature)

- [ ] **Step 1: Failing tests**

- Missing model/bin → throws with message containing `REMIX_PIPER` or `models/tts`.
- With `REMIX_PIPER_BIN` pointing at a Node/bash stub that writes a minimal WAV to `-f` output path, `synthesize` returns mp3-ish buffer, `costUsd === 0`, `durationSec > 0`.
- Stub receives normalized text (spy: write stdin/file containing expanded `%`).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement adapter**

```ts
export class PiperTtsAdapter implements TtsAdapter {
  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const text = safeNormalize(input.text); // try/catch → raw
    assertPiperAssets(); // bin + onnx + json absolute paths
    // spawn(getPiperBin(), ["--model", onnx, "--config", json, "--output_file", wavPath], { stdio })
    // write text to stdin or --input_file
    // ffmpeg wav → mp3; probe duration; costUsd: 0
  }
}
```

Use argv array only (Unicode/spaces safe on Windows).

- [ ] **Step 4: Wire `createTtsAdapter`**

```ts
export const createTtsAdapter = async (
  engine: TtsEngine = getTtsMode(),
): Promise<TtsAdapter> => {
  if (engine === "fake") return new FakeTtsAdapter();
  if (engine === "live") {
    const { HttpTtsAdapter } = await import("./http-tts.adapter");
    return new HttpTtsAdapter();
  }
  if (engine === "piper") {
    const { PiperTtsAdapter } = await import("./piper-tts.adapter");
    return new PiperTtsAdapter();
  }
  throw new Error(`Unknown TTS engine "${engine}"`);
};
```

- [ ] **Step 5: Tests PASS; commit**

```bash
git commit -m "feat(remix): add PiperTtsAdapter via CLI"
```

---

### Task 5: Smart-batch cues (TDD)

**Files:**
- Create: `apps/api/src/modules/remix/tts/smart-batch-cues.ts`
- Create: `apps/api/src/modules/remix/tts/smart-batch-cues.spec.ts`

- [ ] **Step 1: Failing tests**

```ts
describe("smartBatchCuesForTts", () => {
  it("merges adjacent cues under gap/duration/char caps", () => { /* ... */ });
  it("does not merge across large gaps", () => { /* ... */ });
  it("flushes after sentence-ending punctuation when next cue would exceed caps", () => { /* ... */ });
});

describe("splitSmartBatchAudioToCues", () => {
  it("returns one slice per cue at cumulative window boundaries", async () => {
    // fake mode or mocked ffmpeg — lengths match cue count
  });
});
```

Reuse `CueForBatch` / `TtsCueBatch` types from `batch-cues-for-tts.ts` (import types; do not break live `batchCuesForTts`).

Merge defaults: gap `0.6`, duration `12`, chars `500`. Prefer flushing after `.?!…` when adding the next cue would exceed caps (sentence-aware).

Split: call existing `allocateBatchSliceRanges` + `splitBatchAudioToCues` **or** thin wrapper that documents “cue-boundary only” (same allocator already keys off cue list — OK for MVP).

- [ ] **Step 2–4: Red → green → commit**

```bash
git commit -m "feat(remix): add smart cue batching for Piper TTS"
```

---

### Task 6: Cache key includes engine

**Files:**
- Modify: `apps/api/src/modules/remix/tts/tts-batch-cache.ts`
- Modify: `apps/api/src/modules/remix/tts/tts-batch-cache.spec.ts`

- [ ] **Step 1: Change key**

```ts
export const ttsBatchCacheKey = (input: {
  engine: string;
  model: string;
  voiceId: string;
  text: string;
}): string =>
  createHash("sha256")
    .update([input.engine, input.model, input.voiceId, input.text].join("\0"), "utf8")
    .digest("hex");
```

Update all call sites in `remix.processor.ts`.

- [ ] **Step 2: Test different engines → different keys**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(remix): namespace TTS disk cache by engine"
```

---

### Task 7: Wire `handleTts` engine strategy

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`

- [ ] **Step 1: Resolve engine at start of `handleTts`**

```ts
const engine = resolveTtsEngine({
  payloadEngine: typeof payload.engine === "string" ? payload.engine : null,
  remakeEngine: remake.ttsEngine,
});
const adapter = await createTtsAdapter(engine);
```

- [ ] **Step 2: Branch batching**

- `engine === "piper"` → `smartBatchCuesForTts` (+ normalize text per batch before synthesize / cache key uses normalized text)  
- `engine === "live"` → existing `batchCuesForTts` / `per_cue` env  
- `fake` → keep current fake path (adapter already fake)

For Piper: `voiceId` for cache = `getPiperModelStem()`; `model` = `"piper:" + stem`. Skip OpenRouter voice mapping.

- [ ] **Step 3: Persist `ttsEngine` on success** (alongside dub key)

- [ ] **Step 4: Tests**

- Mock adapter factory or inject: `engine=piper` never constructs HTTP adapter.  
- `engine=live` uses ratio batch (spy `batchCuesForTts`).  
- Missing piper assets → `renderPhase=failed` with actionable error.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(remix): route remix_tts through live vs piper strategies"
```

---

### Task 8: API `enqueueTts` + cost estimate

**Files:**
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Modify: `apps/api/src/modules/remix/remix.controller.ts`
- Modify: `apps/api/src/modules/remix/remix.service.spec.ts`
- Modify: `apps/api/src/modules/remix/remix-cost-estimate.ts`
- Modify: `apps/api/src/modules/remix/remix-cost-estimate.spec.ts`

- [ ] **Step 1: Service**

```ts
async enqueueTts(
  id: string,
  opts: { voiceId?: string; engine?: "piper" | "live" } = {},
): Promise<TriggerRemixResult> {
  const engine = resolveTtsEngine({
    payloadEngine: opts.engine,
    remakeEngine: remake.ttsEngine,
  });
  // reject fake from API if somehow sent — map to env or BadRequest; UI never sends fake
  await this.prisma.viralRemake.update({
    data: {
      ttsEngine: engine === "fake" ? remake.ttsEngine : engine,
      ttsVoiceId: opts.voiceId ?? remake.ttsVoiceId,
      renderPhase: "tts",
      ...
    },
  });
  await this.jobsService.enqueue({
    type: "remix_tts",
    payload: {
      remakeId: remake.id,
      engine,
      ...(opts.voiceId ? { voiceId: opts.voiceId } : {}),
    },
    ...
  });
}
```

Controller body: `{ voiceId?: string; engine?: "piper" | "live" }`.

- [ ] **Step 2: Cost estimate**

If resolved engine is `piper` or mode ≠ live → `estimatedUsd: 0`, detail `Piper local · Ngọc Huyền · $0`. Accept optional `engine` query/body override matching UI selection before persist.

- [ ] **Step 3: Tests + commit**

```bash
git commit -m "feat(remix): persist ttsEngine on enqueue and show Piper $0 estimate"
```

---

### Task 9: Remake Studio UI engine control

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/remix/video-output-panel.tsx`
- Modify: `apps/web/src/components/remix/remake-cost-estimates.tsx` (if needed for engine-aware refresh)

- [ ] **Step 1: Types**

```ts
ttsEngine?: "piper" | "live" | null;
// enqueueTts(id, { voiceId?, engine?: "piper" | "live" })
// cost estimate may accept engine query
```

Expose server default: either remake GET includes `defaultTtsEngine` from API, or web reads from cost-estimate payload field `ttsEngine` / `defaultEngine`. Prefer adding `defaultTtsEngine` on cost-estimate response from `getTtsMode()` when remake field null.

- [ ] **Step 2: UI state**

```ts
const [engine, setEngine] = useState<"piper" | "live">(
  remake.ttsEngine === "live" || remake.ttsEngine === "piper"
    ? remake.ttsEngine
    : (costEstimate?.defaultTtsEngine === "live" ? "live" : "piper"),
);
```

Bootstrap rule from spec: persisted wins; else env default from API (**never** force live).

- Select: Local (Ngọc Huyền) | Live (Grok)  
- Hide/disable Grok voice dropdown when `engine === "piper"`  
- Hint text for cost  
- On engine toggle, **re-fetch cost-estimate with `engine=`** so Local shows `$0` before persist (not only after TTS)  
- `enqueueTts({ engine, voiceId: engine === "live" ? voiceId : undefined })`

- [ ] **Step 3: Manual smoke checklist note** in panel or plan smoke section

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): add Remake Studio TTS engine selector"
```

---

### Task 10: Operator setup + processor regression pass

**Files:**
- Modify: `.env.example` (final pass)
- Optional: `docs/superpowers/plans/remix-dub-render-smoke-checklist.md` — add Piper bullets

- [ ] **Step 1: Copy models on the machine**

```bash
mkdir -p apps/api/models/tts/ngoc-huyen
# copy from Downloads + fetch onnx.json beside it
```

- [ ] **Step 2: Run unit suites**

```bash
cd apps/api && npx vitest run \
  src/modules/remix/remix-config.spec.ts \
  src/modules/remix/tts/viet-normalize.spec.ts \
  src/modules/remix/tts/piper-tts.adapter.spec.ts \
  src/modules/remix/tts/smart-batch-cues.spec.ts \
  src/modules/remix/tts/tts-batch-cache.spec.ts \
  src/modules/remix/remix-cost-estimate.spec.ts \
  src/workers/processors/remix.processor.full-script.spec.ts
```

Expected: all PASS.

- [ ] **Step 3: Optional integration**

`PIPER_INTEGRATION=1` with real `piper.exe` + Ngọc Huyền files — synthesize one short sentence.

- [ ] **Step 4: Commit docs/checklist only if changed**

```bash
git commit -m "docs: add Piper local TTS operator smoke notes"
```

---

## Smoke checklist (manual)

1. Set `REMIX_TTS_MODE=piper`, restart API + worker.  
2. Open remake with `ttsEngine=null` → UI shows **Local**.  
3. Run TTS → `ttsCostUsd ≈ 0`, voice Ngọc Huyền, `renderPhase=tts_ready`.  
4. Switch UI to **Live**, run TTS → Grok path + non-zero estimate (if keyed).  
5. Reopen remake → UI still shows last persisted engine (not reset by env).  
6. Listen vs old ratio-batch Grok dub — less mid-word chop expected.

---

## Out of scope (do not implement in this plan)

- Browser ONNX / NGHI web runtime  
- ffmpeg silencedetect snap  
- Multi-voice Piper  
- Hard trim of fit overruns  
- Runtime download from nghitts.app  

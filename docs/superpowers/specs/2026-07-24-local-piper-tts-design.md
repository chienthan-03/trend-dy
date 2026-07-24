# Local Piper TTS (Ngọc Huyền) + Dual Engine — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-24  
**Audience:** Engineering, AI, product — internal Remake Studio  
**Depends on:** [Remix Dub + Letterbox Render](./2026-07-17-remix-dub-render-design.md), batch TTS + assemble path already in tree  
**Related:** Fine-cue timing / STT→TTS sync; cost of OpenRouter Grok voice TTS

---

## 1. Problem

Remake Studio TTS today calls **OpenRouter / Grok** (`REMIX_TTS_MODE=live`) via `HttpTtsAdapter`. That works but:

1. **Costs money** on every full pass (and wasted spend when assemble fails before disk cache existed).  
2. Editors want the **Ngọc Huyền (mới)** review-film voice used widely in VN movie-review dubbing — available as a **Piper `.onnx`** voice in the NGHI-TTS ecosystem, runnable **locally at $0**.  
3. Current **ratio batch-split** (merge cues → one API call → cut by window weight) contributes to **choppy / mid-word cuts**, especially on fine STT cues.

We need a **local Piper path** without removing the live Grok option.

---

## 2. Goals / non-goals

### Goals

- Dual TTS engines selectable per remake job:
  - `live` — existing OpenRouter/Grok HTTP TTS  
  - `piper` — local Piper CLI + Ngọc Huyền (mới) ONNX  
- **Env default + UI override**: control shows persisted `ttsEngine` when set, else server `REMIX_TTS_MODE`; editor can switch per TTS run.  
- Vietnamese **text normalization** before Piper (numbers, dates, Latin loanwords → readable VI).  
- **Smart batching** for Piper only: merge by sentence/silence; avoid mid-word ratio cuts.  
- Piper TTS **costUsd = 0**; cost-estimate UI reflects that.  
- Keep existing fit → assemble → MinIO → render pipeline unchanged.  
- Ship model files under a fixed project path (gitignored weights).

### Non-goals (MVP)

- Browser / ONNX Runtime Web inference (NGHI-TTS demo architecture)  
- Multiple Piper voices (only Ngọc Huyền mới)  
- VBee or other cloud VN TTS vendors  
- Replacing STT / translate / generate OpenRouter spend  
- Guaranteeing zero fit failures on fine cues (trim/overlap polish may follow)  
- Training or fine-tuning voices  

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Engine selection | Keep **both** `live` and `piper` |
| Where to choose | **Env default** (`REMIX_TTS_MODE`) + **UI per-job** override |
| Local voice | **Ngọc Huyền (mới)** only |
| Model assets | Piper pair: `.onnx` + `.onnx.json` from NGHI naming; verified local weights ~60.6MB match remote magic |
| Model placement | `apps/api/models/tts/ngoc-huyen/` + **gitignore** large `.onnx`; env points at dir |
| Inference | **Piper CLI** (`piper.exe` / `piper`) on the worker machine |
| Text prep (piper) | Full **VI normalizer** before synthesize |
| Text prep (live) | No-op (unchanged) |
| Batch (piper) | **Smart batch** (sentence/silence; no mid-word ratio split) |
| Batch (live) | Existing **ratio batch** (cost control) |
| UI default | Control shows `remake.ttsEngine` if set, else `REMIX_TTS_MODE`; `fake` not in UI |
| Architecture style | **Engine strategy** (Approach 2): pluggable engine + prep + batch strategy inside one `handleTts` |

---

## 4. Architecture

### 4.1 High level

```
UI Remake Studio                         Worker remix_tts
─────────────────                        ────────────────
[Engine: piper | live]  ──payload──►     resolveEngine(job override → env → fake)
  default ← GET/config / remake field      │
                                           ├─ live  → prep=noop, batch=ratio, HttpTtsAdapter
                                           └─ piper → prep=vietNormalizer, batch=smart, PiperTtsAdapter
                                                         │
                                                         ▼
                                           synthesize → segment fit → assembleDubTimeline → putDub
                                           (STT / translate / render unchanged)
```

### 4.2 Units (isolation)

| Unit | Responsibility | Depends on |
|---|---|---|
| `resolveTtsEngine` | Map payload + env → `live` \| `piper` \| `fake` | config |
| `TtsAdapter` (+ `PiperTtsAdapter`) | `synthesize({ text, voiceId })` → mp3 buffer, duration, cost | Piper CLI, model paths, ffmpeg |
| `viet-normalize` | VI text → speakable text for Piper | normalizer lib or vetted ruleset |
| `ratio` batch (existing) | Merge cues for live cost savings; split by window weight | `batch-cues-for-tts`, `split-batch-audio` |
| `smart` batch (new) | Merge by gap/sentence caps; split at cue/silence boundaries | cue timing, optional energy/silence detect |
| Disk TTS cache | Key = `engine + model/voice + text` | existing cache helper extended |
| Cost estimate | `piper` → $0; `live` → existing estimator | remix-cost-estimate |

Live and Piper share fit/assemble/storage. They must **not** share cache entries.

### 4.3 Model layout

```
apps/api/models/tts/ngoc-huyen/
  Ngọc Huyền (mới).onnx          # gitignored
  Ngọc Huyền (mới).onnx.json     # may commit if small / redistributable, or gitignore both + document copy steps
```

Env (names illustrative; finalize in plan):

- `REMIX_TTS_MODE=piper|live|fake`  
- `REMIX_PIPER_BIN` — path to Piper executable (default `piper` on PATH)  
- `REMIX_PIPER_MODEL_DIR` — default `apps/api/models/tts/ngoc-huyen`  
- Smart-batch tunables: max gap, max duration, max chars (env-backed)

**License gate:** Document that Ngọc Huyền weights come from the NGHI-TTS ecosystem; operators must confirm redistribution/use rights before production deploy. Implementation loads from **local paths only** (no runtime scrape of nghitts.app required).

---

## 5. Data flow + API / UI

### 5.1 Engine resolution order

1. Explicit job payload / remake field (`ttsEngine`)  
2. `REMIX_TTS_MODE`  
3. Code default `fake` (CI / unset)

### 5.2 Persistence

- Remake field: `ttsEngine: "piper" | "live"` (nullable → treat as unresolved / use env on next TTS).  
- Optional: keep `ttsVoiceId` for **live** only; Piper ignores and forces Ngọc Huyền model files.  

### 5.3 API

- `POST /viral/remix/:id/tts` body: `{ engine?: "piper" | "live", voiceId?: string }`  
  - Persist chosen engine on remake; enqueue `remix_tts` with same in payload.  
- Cost-estimate endpoint / payload: include resolved engine; Piper line items **$0**.  
- Optional read of server default engine for UI bootstrap (existing remake GET or small config field).

### 5.4 UI (Remake Studio)

- Control: **Engine — Local (Ngọc Huyền) | Live (Grok)**  
  - **Bootstrap:** show persisted `remake.ttsEngine` when set; otherwise show env-resolved server default (`REMIX_TTS_MODE`). Never reset a saved remake back to env on reopen (avoids accidental Live/Grok credit burn).  
  - `fake` is **CI/env-only** — not offered in the UI; under the same resolve order it keeps today’s non-Piper fake adapter path.  
- Short hint: local free / live uses OpenRouter credit  
- “Tạo audio VI” always **persists** the selected engine on the remake and enqueues TTS with that engine in the payload

---

## 6. Smart-batch (Piper) behavior

### Merge rules (MVP)

Merge adjacent cues when **all** hold:

- Gap between `endSec[i]` and `startSec[i+1]` ≤ `maxGapSec` (default band ~0.4–0.75s, env-tunable)  
- Combined duration and/or character count under caps (~10–15s / ~400–600 chars, env-tunable)  
- Prefer not to cross a strong sentence boundary **out** of a batch mid-merge in a way that strands punctuation (implementation detail in plan)

Do **not** merge across large silence gaps.

### Split rules (MVP)

After one Piper call per merged batch text:

1. Prefer split points at **original cue boundaries** aligned to detected silence/pauses inside the batch audio when cheap to detect.  
2. Fallback: allocate contiguous slices by **cumulative cue window weights along the batch timeline** (same weight idea as today) but **only at cue boundaries** already chosen by merge — never invent cut points inside a single cue’s text span.  
3. Do **not** use byte-ratio fake splits in live Piper path.

Live/Grok keeps current ratio batch + `split-batch-audio` behavior.

---

## 7. Piper adapter

1. Run `vietNormalizer(text)` (on failure: log warn, fall back to original text).  
2. Invoke Piper CLI with model + config → WAV (stdin or temp input file).  
3. ffmpeg WAV → MP3; probe `durationSec`.  
4. Return `{ buffer, contentType: "audio/mpeg", durationSec, costUsd: 0 }`.  

Missing binary, model, or config → **fail job early** with actionable `renderError` (install Piper / set paths / copy onnx pair).

Piper CLI non-zero exit → **fail the job** in MVP (easier debug than partial dub).

---

## 8. Errors

| Situation | Behavior |
|---|---|
| Missing `piper` binary / model / `.onnx.json` | Early fail; clear message |
| Normalizer throws | Warn + use raw text |
| Piper synthesize fails | Fail job (`renderPhase=failed`) |
| Live 402 / credit | Unchanged; UI can suggest switching to local |
| Assemble / fit | Unchanged shared path |

---

## 9. Testing

- Unit: normalizer cases (numbers, `%`, simple Latin → VI reading); smart-batch merge/split; `createTtsAdapter` / engine matrix  
- Adapter: CI uses a **fake piper script** that writes a tiny wav; optional `PIPER_INTEGRATION=1` on a machine with real CLI + Ngọc Huyền files  
- Processor: `engine=piper` selects smart+piper; `engine=live` never invokes Piper  

---

## 10. Success criteria (MVP)

1. With `REMIX_TTS_MODE=piper`, UI defaults to local; full remake TTS run records **~$0** TTS cost.  
2. Output voice is Ngọc Huyền (mới); normalized text is used for Piper.  
3. Same dense remake sounds **less choppy** than ratio-batch Grok path (subjective A/B listen).  
4. Switching UI to live still produces Grok dub as today.  

---

## 11. Open points for implementation plan (not blockers)

1. Exact npm/package vs vendored rules for VI normalizer.  
2. Silence-detect method for smart split (ffmpeg `silencedetect` vs duration-only fallback).  
3. Whether `.onnx.json` is committed or documented as manual copy alongside gitignored `.onnx`.  
4. Windows path quoting for model filename with spaces/Unicode (`Ngọc Huyền (mới).onnx`).  

---

## 12. Out of scope follow-ups

- Hard trim of overrun after max speed (fit-failure bleed)  
- WebGPU/browser preview TTS  
- Additional Piper voices  
- Auto-download models from nghitts.app at runtime  

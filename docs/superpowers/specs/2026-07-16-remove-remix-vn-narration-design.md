# Remove Remix VN Narration & Hook — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-16  
**Audience:** Engineering  
**Depends on:** [Viral Feed & Remix Factory](./2026-07-14-viral-feed-remix-factory.md), Phase A/B remix package + STT pipeline  
**Approach:** Slim schema (hard remove) — not feature-flag, not soft-stub  
**Delta note:** Parent PRD still lists rewritten script + hook as Phase A outputs; this spec **supersedes** those two fields for implementation going forward. Packaging/banners/subtitles remain.

---

## 1. Goal

Remove **Remix script (VN narration)** and **Hook 3s** from the remix package end-to-end (types, LLM prompts, editor UI, policy checklist, export zip).

**Keep unchanged:**

- Full-script STT pipeline (`download → STT → translate → generate`)
- Transcript panel (source + translated VI + retranslate)
- Package fields: **banners**, **packaging** (titles, description, hashtags), **subtitles** (SRT cues)

**Clarify (not the same thing):**

| Concept | Storage | Fate |
|---|---|---|
| VN narration (`script.narration`) | `packageJson.script` | **Remove** |
| Hook 3s | `packageJson.hook_3s` | **Remove** |
| STT source transcript | `sourceTranscript` | Keep |
| Translated VI transcript | `sourceTranscriptTranslated` | Keep; **add to export zip** |

---

## 2. Package shape (slim)

Shared type `RemixPackageV1` (and Zod for `remix.package.v1` / `v2`) becomes:

```ts
{
  locale: "vi",
  banners: { top: string; bottom: string; watermark: string },
  packaging: {
    titles: string[];
    description: string;
    hashtags: string[];
  },
  subtitles: {
    format: "srt";
    cues: Array<{ start: string; end: string; text: string }>;
    timing_source?: "estimated" | "stt"; // v2 / full mode
  },
  transform_notes: {
    source_language: string;
    rewrite_strategy: string; // reword away from “narration rewrite”
    risks: string[];
    // v2 extras unchanged where still relevant:
    input_mode?: "transcript_full";
    source_duration_sec?: number;
  };
}
```

**Removed from type / Zod / prompt OUTPUT_SCHEMA:** `script`, `hook_3s`.

No Prisma migration — `packageJson` remains JSON. Old rows may still contain removed keys; loaders strip/ignore them; new generates persist only the slim shape.

---

## 3. Pipeline

Job graph is unchanged:

```
resolve / fetch_detail
  → [full mode] download_media → stt → translate (if enabled)
  → remix_generate
  → ready
```

`remix_generate` still runs; LLM output validated against slim Zod. Fake gateway fixtures updated to omit narration/hook.

Remove remake-service policy warnings that target narration or hook (e.g. `literalOverlapRatio(caption, narration)` and any “hook chưa viết mới” advisory). Keep warnings that still apply to banners / packaging / studio brand.

Also update fake LLM fixtures in `apps/api/src/ai/gateway.ts` and prompt builders `buildRemixPrompt` / `buildRemixPromptV2`.

---

## 4. Prompts

Update `remix.package.v1` and `remix.package.v2`:

- OUTPUT_SCHEMA / Zod: no `script`, no `hook_3s`
- System rules: drop narration length rules, hook ≤3s rules, “recap toàn bộ video via narration”
- Focus rules on: Vietnamese banners + packaging + timed subtitles
  - **v2 (full / STT):** subtitle cues follow STT timing (existing rule)
  - **v1 (caption mode):** subtitle cues derived from caption/title context (estimated timing) — not from narration
- Bump seeded prompt template version so active rows refresh on next seed / deploy path used by the project

---

## 5. UI

**`RemakeEditor`:** remove narration textarea and Hook 3s fieldset; keep banners, packaging, SRT preview.

**Remake studio page:** remove “Độ dài narration…” callout in full mode.

**Transcript panel:** no change (source / translated / retranslate stay).

**Policy checklist** (`RemixPolicyChecklist`):

| Remove | Keep |
|---|---|
| `scriptRewritten` | `hasStudioBrand` |
| `hookIsNew` | `voiceWillBeRerecorded` |
| | `noFullReupload` |
| | `leadApproved` |

Update `defaultRemixPolicyChecklist`, `isPolicyChecklistComplete`, web checklist labels, DTOs, and tests.

---

## 6. Export zip

After policy gate, zip contents:

| Entry | Source | Notes |
|---|---|---|
| `transcript-source.txt` | `sourceTranscript.fullText` | If transcript present |
| `transcript-source.srt` | STT segments | If transcript present |
| `transcript-vi.txt` | `sourceTranscriptTranslated.fullText` | **New** — only if translated exists |
| `transcript-vi.srt` | translated segments | **New** — only if translated exists |
| `package.srt` | `packageJson.subtitles.cues` | Required when package ready |
| `titles.txt` | packaging titles | Keep |
| `banners.txt` | top / bottom / watermark lines | New dedicated file (or equivalent clear text) |
| `description.txt` | packaging description (+ hashtags optional) | Prefer explicit text over relying only on JSON |
| `package.json` | slim package JSON | Always write **stripped** slim shape — never re-emit legacy `script` / `hook_3s` even if still present in DB |

**Removed entries:** `script-full.txt`, `script.txt`, `hook.txt`.

---

## 7. Compatibility & errors

- **Read path:** if stored JSON has `script` / `hook_3s`, ignore; if missing banners/packaging/subtitles, editor shows empty state / prompt Regenerate.
- **Generate path:** Zod failure if LLM omits required slim fields.
- **Export path:** missing translated transcript → omit `transcript-vi.*` (do not fail export); missing package still fails as today. When exporting legacy remakes, strip `script` / `hook_3s` from the `package.json` zip entry (same slim serializer as new generates).

---

## 8. Testing

- Shared / Zod: slim schema accepts new shape; rejects requiring narration/hook.
- Export unit: zip entry names include VI transcript when present; exclude script/hook files.
- Processor / e2e: drop `narration.length` assertions; assert banners/packaging/subtitles present.
- Policy: complete without `scriptRewritten` / `hookIsNew`.
- Web: no remaining references to `packageJson.script.narration` or hook editor fields.
- Prompt specs: update “non-literal translation / narration” examples to packaging/subtitle-focused checks.

---

## 9. Out of scope

- Removing STT or `remix_translate`
- Changing Douyin adapters / media download flags
- Prisma schema changes
- Feature flag to re-enable narration
- Auto-publish / video render

---

## 10. Success criteria

1. Editor has no VN narration or Hook 3s UI.
2. New `remix_generate` packages validate without `script` / `hook_3s`.
3. Export zip includes source + VI transcripts (when available) and packaging/banners/SRT; no script/hook files.
4. Transcript full-script STT UX unchanged.
5. Existing tests updated and green for api remix + export suites.

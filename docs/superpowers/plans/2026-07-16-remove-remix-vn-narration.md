# Remove Remix VN Narration & Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-remove VN narration (`script`) and Hook 3s from the remix package while keeping STT/translate transcript, banners, packaging, and subtitles — and export VI transcript in the zip.

**Architecture:** Slim `RemixPackageV1` in `@factory/shared`, update Zod/prompts/fake gateway to match, strip legacy keys on export, remove narration/hook UI and policy checklist items. Pipeline job graph unchanged.

**Tech Stack:** TypeScript, NestJS API, Next.js web, Zod, Vitest, Prisma JSON (`packageJson`), archiver zip export

**Spec:** [docs/superpowers/specs/2026-07-16-remove-remix-vn-narration-design.md](../specs/2026-07-16-remove-remix-vn-narration-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/shared/src/remix-types.ts` | Slim `RemixPackageV1` + slim `RemixPolicyChecklist` |
| `packages/shared/src/remix-policy.ts` | Defaults + `isPolicyChecklistComplete` |
| `apps/api/src/ai/prompts/remix.package.v1.ts` | Zod v1, OUTPUT_SCHEMA, system rules, seed version bump |
| `apps/api/src/ai/prompts/remix.package.v2.ts` | Zod v2 extend slim base; rules without narration/hook |
| `apps/api/src/ai/prompts/remix.package.v1.spec.ts` | Prompt/parse tests |
| `apps/api/src/ai/prompts/remix.package.v2.spec.ts` | Prompt/parse tests |
| `apps/api/src/ai/gateway.ts` | Fake `remix_generate` / `buildFakeRemixGenerateV2` fixtures |
| `apps/api/src/modules/remix/remix-export.service.ts` | Zip entries + slim serializer |
| `apps/api/src/modules/remix/remix-export.service.spec.ts` | Export assertions |
| `apps/api/src/modules/remix/remix.service.ts` | Drop narration/hook policy warnings |
| `apps/api/src/modules/remix/remix.service.spec.ts` | Warning tests |
| `apps/api/src/modules/remix/dto/update-remix.dto.ts` | Checklist DTO fields |
| `apps/api/src/modules/remix/remix-policy.guard.spec.ts` | Checklist fixtures |
| `apps/api/src/modules/remix/remix.e2e.spec.ts` | Drop narration length asserts |
| `apps/api/src/workers/processors/remix.processor.spec.ts` | Fake package shape |
| `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` | Fake package shape |
| `apps/web/src/components/remix/remake-editor.tsx` | Remove narration + hook UI |
| `apps/web/src/components/remix/policy-checklist.tsx` | Remove two checklist items |
| `apps/web/src/app/(app)/remix/[remakeId]/page.tsx` | Remove narration length callout |
| Docs smoke checklists (optional polish) | Assert packaging/SRT instead of narration |

**Helper (recommended):** add `toSlimRemixPackage(raw: unknown): RemixPackageV1` in `packages/shared/src/remix-policy.ts` (or small `remix-package.ts`) so export + API load share one strip serializer.

---

### Task 1: Slim shared types + policy checklist

**Files:**
- Modify: `packages/shared/src/remix-types.ts`
- Modify: `packages/shared/src/remix-policy.ts`
- Create (optional): `packages/shared/src/remix-package.ts` + export from `packages/shared/src/index.ts`
- Test: add `packages/shared/src/remix-policy.spec.ts` if no shared test runner; otherwise cover via API import in Task 2. Prefer API-side tests that import `@factory/shared` if shared has no vitest config.

- [ ] **Step 1: Update `RemixPackageV1` and checklist types**

Replace package type with slim shape (no `script`, no `hook_3s`). Remove `scriptRewritten` and `hookIsNew` from `RemixPolicyChecklist`.

```ts
export type RemixPackageV1 = {
  locale: "vi";
  banners: { top: string; bottom: string; watermark: string };
  packaging: { titles: string[]; description: string; hashtags: string[] };
  subtitles: {
    format: "srt";
    cues: Array<{ start: string; end: string; text: string }>;
    /** Present on full-script (v2) packages; omit in caption mode. */
    timing_source?: "estimated" | "stt";
  };
  transform_notes: {
    source_language: string;
    rewrite_strategy: string;
    risks: string[];
  };
};

export type RemixPolicyChecklist = {
  hasStudioBrand: boolean;
  voiceWillBeRerecorded: boolean;
  noFullReupload: boolean;
  leadApproved: boolean;
};
```

Keep `RemixSubtitlesV2` as `RemixPackageV1["subtitles"] & { timing_source: "estimated" | "stt" }` (required for v2 consumers).

- [ ] **Step 2: Update `remix-policy.ts`**

```ts
export const defaultRemixPolicyChecklist = (): RemixPolicyChecklist => ({
  hasStudioBrand: false,
  voiceWillBeRerecorded: false,
  noFullReupload: false,
  leadApproved: false,
});

export const isPolicyChecklistComplete = (c: RemixPolicyChecklist): boolean =>
  c.hasStudioBrand &&
  c.voiceWillBeRerecorded &&
  c.noFullReupload &&
  c.leadApproved;
```

Add strip helper:

```ts
export const toSlimRemixPackage = (raw: unknown): RemixPackageV1 => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const banners = (o.banners ?? {}) as RemixPackageV1["banners"];
  const packaging = (o.packaging ?? {}) as RemixPackageV1["packaging"];
  const subtitles = (o.subtitles ?? { format: "srt", cues: [] }) as RemixPackageV1["subtitles"];
  const transform_notes = (o.transform_notes ?? {
    source_language: "unknown",
    rewrite_strategy: "packaging_subtitles",
    risks: [],
  }) as RemixPackageV1["transform_notes"];

  return {
    locale: "vi",
    banners: {
      top: banners.top ?? "",
      bottom: banners.bottom ?? "",
      watermark: banners.watermark ?? "",
    },
    packaging: {
      titles: Array.isArray(packaging.titles) ? packaging.titles : [],
      description: packaging.description ?? "",
      hashtags: Array.isArray(packaging.hashtags) ? packaging.hashtags : [],
    },
    subtitles: {
      format: "srt",
      cues: Array.isArray(subtitles.cues) ? subtitles.cues : [],
      ...(typeof (subtitles as { timing_source?: string }).timing_source === "string"
        ? {
            timing_source: (subtitles as { timing_source: "estimated" | "stt" })
              .timing_source,
          }
        : {}),
    } as RemixPackageV1["subtitles"],
    transform_notes,
  };
};
```

Export helper from `packages/shared/src/index.ts` if in a new file.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/remix-types.ts packages/shared/src/remix-policy.ts packages/shared/src/index.ts
git commit -m "refactor(shared): slim remix package and policy checklist"
```

---

### Task 2: Slim Zod + prompts v1/v2 (TDD)

**Files:**
- Modify: `apps/api/src/ai/prompts/remix.package.v1.ts`
- Modify: `apps/api/src/ai/prompts/remix.package.v2.ts`
- Modify: `apps/api/src/ai/prompts/remix.package.v1.spec.ts`
- Modify: `apps/api/src/ai/prompts/remix.package.v2.spec.ts`

- [ ] **Step 1: Rewrite failing tests first**

In `remix.package.v1.spec.ts`, change fixtures to slim packages (no `script`/`hook_3s`). Assert:

- `parseRemixPackageJson` accepts slim JSON
- `buildRemixPrompt` system rules do **not** contain narration length / hook ≤3s wording
- `buildRemixPrompt` system rules **do** mention banners + packaging + subtitles
- Parsing JSON that only has narration/hook (missing banners) fails Zod

In `remix.package.v2.spec.ts`, same for v2; assert STT timing rules remain; drop narration length assertions.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter api exec vitest run src/ai/prompts/remix.package.v1.spec.ts src/ai/prompts/remix.package.v2.spec.ts
```

Expected: FAIL (fixtures/schema still require narration/hook)

- [ ] **Step 3: Implement slim Zod + rules**

In `remix.package.v1.ts`:

- Delete `scriptSectionSchema`, `hook3sSchema`, and `script`/`hook_3s` from `remixPackageV1Schema` and `REMIX_PACKAGE_V1_OUTPUT_SCHEMA`
- Rewrite `REMIX_PACKAGE_V1_SYSTEM_RULES` to require Vietnamese banners, packaging, and subtitles derived from caption (estimated timing) — no narration/hook
- Also reframe `buildRemixPrompt` **user** string away from “viết lại recap tiếng Việt” toward packaging/subtitle generation from caption
- Bump `REMIX_PACKAGE_V1_SEED.version` to `2`

In `remix.package.v2.ts`:

- Keep `.omit` / `.extend` pattern on slim v1 base
- Rewrite `REMIX_PACKAGE_V2_OUTPUT_SCHEMA` and `REMIX_PACKAGE_V2_SYSTEM_RULES` without narration/hook; keep STT cue timing rules
- Reframe `buildRemixPromptV2` user string similarly (packaging/subtitles from transcript, not narration recap)
- Bump `REMIX_PACKAGE_V2_SEED.version` to `2`

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter api exec vitest run src/ai/prompts/remix.package.v1.spec.ts src/ai/prompts/remix.package.v2.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/prompts/
git commit -m "refactor(api): slim remix.package v1/v2 prompts without narration/hook"
```

---

### Task 3: Fake gateway fixtures

**Files:**
- Modify: `apps/api/src/ai/gateway.ts` (`FAKE_VI_BY_TYPE.remix_generate`, `buildFakeRemixGenerateV2`)

- [ ] **Step 1: Update fake JSON**

Remove `script` and `hook_3s` from both fake remix payloads. Keep banners, packaging, subtitles, transform_notes. For v2, keep duration-based cue generation; drop narration string construction.

Leave unrelated keys `"script.narration"` / `"pack.hook_3s"` in `FAKE_VI_BY_TYPE` if they serve the **novel generate** path (not remix package) — do not delete those unless TypeScript forces it.

- [ ] **Step 2: Quick compile/test smoke**

```bash
pnpm --filter api exec vitest run src/workers/processors/remix.processor.spec.ts src/workers/processors/remix.processor.full-script.spec.ts
```

Expected: may FAIL until Task 5 updates processor specs — if so, proceed; if gateway-only tests exist and fail on shape, fix fixtures now.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ai/gateway.ts
git commit -m "fix(api): slim fake remix_generate fixtures"
```

---

### Task 4: Export zip (TDD)

**Files:**
- Modify: `apps/api/src/modules/remix/remix-export.service.ts`
- Modify: `apps/api/src/modules/remix/remix-export.service.spec.ts`

- [ ] **Step 1: Update export tests to new contract**

Update `samplePackage()` to slim shape. Update `completeChecklist()` without `scriptRewritten`/`hookIsNew`.

Add/adjust assertions:

- Zip contains `package.srt`, `titles.txt`, `banners.txt`, `description.txt`, `package.json`
- Zip does **not** contain `script.txt`, `script-full.txt`, `hook.txt`
- When remake has `sourceTranscriptTranslated`, zip contains `transcript-vi.txt` and `transcript-vi.srt`
- When only source transcript, still has `transcript-source.*`, no `transcript-vi.*`
- `package.json` entry parsed JSON has no `script` / `hook_3s` even if DB raw object included them (legacy strip)

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter api exec vitest run src/modules/remix/remix-export.service.spec.ts
```

- [ ] **Step 3: Implement export**

In `createZipStream(pkg, transcript, translated?)`:

```ts
const slim = toSlimRemixPackage(pkg);

if (transcript) {
  archive.append(transcript.fullText, { name: "transcript-source.txt" });
  archive.append(buildSrtFromSegments(transcript.segments), {
    name: "transcript-source.srt",
  });
}

if (translated) {
  archive.append(translated.fullText, { name: "transcript-vi.txt" });
  archive.append(buildSrtFromSegments(translated.segments), {
    name: "transcript-vi.srt",
  });
}

archive.append(this.buildSrtFromCues(slim.subtitles.cues), { name: "package.srt" });
archive.append(slim.packaging.titles.join("\n"), { name: "titles.txt" });
archive.append(
  [`top: ${slim.banners.top}`, `bottom: ${slim.banners.bottom}`, `watermark: ${slim.banners.watermark}`].join("\n"),
  { name: "banners.txt" },
);
archive.append(
  [slim.packaging.description, "", slim.packaging.hashtags.join(" ")].join("\n"),
  { name: "description.txt" },
);
archive.append(JSON.stringify(slim, null, 2), { name: "package.json" });
```

In `exportRemake`, pass `sourceTranscriptTranslated` as third arg (cast `RemixTranscriptV1 | null`).

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm --filter api exec vitest run src/modules/remix/remix-export.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/remix-export.service.ts apps/api/src/modules/remix/remix-export.service.spec.ts
git commit -m "feat(api): slim remix export zip with transcript-vi"
```

---

### Task 5: Remake service warnings + DTO + remaining API tests

**Files:**
- Modify: `apps/api/src/modules/remix/remix.service.ts` (`computePolicyWarnings`)
- Modify: `apps/api/src/modules/remix/remix.service.spec.ts`
- Modify: `apps/api/src/modules/remix/dto/update-remix.dto.ts`
- Modify: `apps/api/src/modules/remix/remix-policy.guard.spec.ts`
- Modify: `apps/api/src/modules/remix/remix.e2e.spec.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.spec.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`
- Grep and fix any other fixtures still using `script`/`hook_3s`/`scriptRewritten`

- [ ] **Step 1: Grep for leftover references**

```bash
rg -n "scriptRewritten|hookIsNew|hook_3s|script\.narration|script-full\.txt" apps/api packages/shared
```

- [ ] **Step 2: Slim `computePolicyWarnings`**

Remove narration overlap and hook-copy warnings. Keep watermark/branding check (and any packaging-related warnings if present).

Remove unused `literalOverlapRatio` import if no longer used in this file.

- [ ] **Step 3: Fix DTO + all API fixtures/tests**

- Drop checklist fields from `RemixPolicyChecklistDto`
- Update e2e: assert `pkg.banners` / `pkg.packaging.titles` / `pkg.subtitles.cues.length` instead of `narration.length`
- Update e2e export zip expectations: remove `hook.txt` / `script.txt` / `script-full.txt`; expect `banners.txt` / `description.txt` / optional `transcript-vi.*`
- Update processor mocks’ returned package JSON to slim shape

- [ ] **Step 4: Run API remix-related tests**

```bash
pnpm --filter api exec vitest run src/modules/remix src/workers/processors/remix.processor.spec.ts src/workers/processors/remix.processor.full-script.spec.ts src/ai/prompts/remix.package
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "refactor(api): drop narration/hook warnings and update remix tests"
```

---

### Task 6: Web editor + policy UI

**Files:**
- Modify: `apps/web/src/components/remix/remake-editor.tsx`
- Modify: `apps/web/src/components/remix/policy-checklist.tsx`
- Modify: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx`
- Check: `apps/web/src/lib/api-client.ts` (only if types break; novel `script.narration` generate types stay)

- [ ] **Step 1: Slim `RemakeEditor`**

Remove `updateScript`, hook fieldset, narration textarea, and related helpers. Keep banners, packaging, SRT preview.

- [ ] **Step 2: Slim policy checklist UI**

Remove `scriptRewritten` and `hookIsNew` entries from `CHECKLIST_ITEMS`.

- [ ] **Step 3: Remake page**

Remove the blue “Độ dài narration…” block. Ensure page still loads transcript panel unchanged.

- [ ] **Step 4: Typecheck / build web**

```bash
pnpm --filter web build
```

Expected: PASS (or fix any `packageJson.script` references)

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "refactor(web): remove remix narration and hook from editor UI"
```

---

### Task 7: Docs smoke checklists + final verification

**Files:**
- Modify (light): `docs/superpowers/plans/phase-b-full-script-smoke-checklist.md` — replace narration spot-checks with packaging/SRT + transcript-vi export checks
- Optional: note in parent PRD is already covered by delta note in spec — skip large PRD rewrite

- [ ] **Step 1: Update Phase B smoke checklist bullets** that require VN narration length / “Vietnamese narration accurately recaps”

Replace with:

- Export zip has `transcript-vi.txt` when translate ran
- Package has banners + titles + `package.srt`
- No `script.txt` / `hook.txt` in zip

- [ ] **Step 2: Full verification**

```bash
pnpm --filter api exec vitest run src/modules/remix src/workers/processors/remix.processor src/ai/prompts/remix.package
pnpm --filter web build
rg -n "Remix script \(VN narration\)|script-full\.txt|hookIsNew|packageJson\.script" apps/web apps/api/src/modules/remix apps/api/src/ai/prompts
```

Expected: tests PASS; rg finds no remix-package narration/hook leftovers (ignore novel generate `script.narration` if any).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/phase-b-full-script-smoke-checklist.md
git commit -m "docs: update remix smoke checklist after dropping narration/hook"
```

---

## Done when

1. Shared type has no `script` / `hook_3s`; checklist has no `scriptRewritten` / `hookIsNew`
2. Prompts + fake gateway emit slim packages
3. Export includes `transcript-vi.*` when translated; strips legacy keys; no script/hook files
4. Web editor shows banners/packaging/SRT only; transcript STT UI unchanged
5. API remix tests + web build green

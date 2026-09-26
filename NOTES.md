# Kiro Feature Notes

Log of Kiro features used during this project, for the final submission form.

## Steering
- Added `.kiro/steering/scoring.md`, `ui.md`, `storage.md` to enforce project conventions
  (pure scoring functions, mobile/accessible UI, IndexedDB-only storage) across all sessions.

## Specs

### Lesson 1: Feature Specs - Daily Challenge (Phase 1 core flow)
- Used the Requirements -> Design -> Tasks spec workflow to plan the core loop: lesson structure,
  daily challenge generation, instant grading with source traceability, deterministic scoring, and
  local persistence.
- Requirements written in EARS notation (WHEN/THE SYSTEM SHALL) and refined via automatic
  requirement-detailing (closed gaps like concept-reuse rules, storage failure fallback behavior,
  and score-update timing).
- Design defines the tech stack (TypeScript + Vite + React, hand-written IndexedDB wrapper), data
  model, and 15 correctness properties for property-based testing (Vitest + fast-check).
- Tasks broken into 4 sequential phases: setup -> storage & scoring engines -> UI components ->
  sample lesson integration, each task independently testable.
- Docs: [requirements.md](kiro-spec://create?featureName=daily-challenge&documentType=requirements),
  [design.md](kiro-spec://create?featureName=daily-challenge&documentType=design),
  [tasks.md](kiro-spec://create?featureName=daily-challenge&documentType=tasks)
- Task 1 (setup) executed: Vite + TypeScript (strict) + React 18 scaffolded by hand (interactive
  `create-vite` wizard wouldn't run non-interactively in this shell), `src/{domain,storage,data,ui}`
  folders created per design.md. Vitest + fast-check + fake-indexeddb configured; smoke test and
  production build both verified passing with 0 npm audit vulnerabilities.

## Hooks

### Lesson 3: Hooks - Test on Save
- Added `.kiro/hooks/test-on-save.json`, a `PostFileSave` hook that runs our Vitest suite
  automatically whenever domain/storage source files change.
- Trigger: `PostFileSave`
- Matcher: `src/.*\.(ts|tsx)$` (any TypeScript/TSX file under `src/`, covering domain, storage,
  and UI code)
- Action: `command` -> `npx vitest run`
- Why: catches regressions in the pure scoring/grading/storage engines the moment they're saved,
  instead of waiting for a manual test run or CI.

## Property-Based Testing

### Lesson 4: Property-Based Tests - Lesson validation & selection
- Implemented `validateLesson` and `selectActiveLesson` in `src/domain/lesson.ts` (Tasks 4.1, 4.4),
  plus the data model types in `src/domain/types.ts` (Task 3.1).
- Wrote property-based tests with `fast-check` in `src/domain/lesson.property.test.ts`, covering
  design.md's Property 1, 2, and 4 (200 runs each):
  - **Property 1** - a Lesson is section-count-valid if and only if it has exactly 4 sections.
  - **Property 2** - a Lesson_Section is field-valid if and only if its trimmed title (1-100),
    trimmed explanation (1-2000), and concept count (1-20) are all in bounds, probed with
    empty/whitespace/boundary/over-length generated strings.
  - **Property 4** - `selectActiveLesson` returns the Sample_Lesson if and only if no non-sample
    stored lesson validates; otherwise it returns a lesson that does validate.
- All 9 tests (2 smoke + 7 property/example tests) pass; build and `npm audit` stayed clean.

## Vibe / Agentic coding
- (not yet used)

## Other
- (not yet used)

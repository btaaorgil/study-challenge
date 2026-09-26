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

### Lesson 4: Property-Based Testing
- **Lesson validation & selection** - Implemented `validateLesson` and `selectActiveLesson` in
  `src/domain/lesson.ts` (Tasks 4.1, 4.4), plus the data model types in `src/domain/types.ts`
  (Task 3.1). Property-based tests in `src/domain/lesson.property.test.ts` (200 runs each):
  - **Property 1** - a Lesson is section-count-valid if and only if it has exactly 4 sections.
  - **Property 2** - a Lesson_Section is field-valid if and only if its trimmed title (1-100),
    trimmed explanation (1-2000), and concept count (1-20) are all in bounds, probed with
    empty/whitespace/boundary/over-length generated strings.
  - **Property 4** - `selectActiveLesson` returns the Sample_Lesson if and only if no non-sample
    stored lesson validates; otherwise it returns a lesson that does validate.

- **Storage_Layer** - Implemented `src/storage/db.ts` (Task 5): IndexedDB schema v1 (`lessons`,
  `dailyChallenges`, `attempts` stores with `by_dateKey`/`by_question` indexes), typed CRUD API,
  and a transparent in-memory fallback adapter for `unsupported`/`blocked`/`quota-exceeded`
  conditions. Property-based tests in `src/storage/db.property.test.ts`:
  - **Property 3** - authored section order survives a full storage round-trip (50 runs).
  - **Property 15** - a randomly generated Daily_Challenge + its Attempts read back deep-equal to
    what was written for the same dateKey (50 runs).
  - Also added unit tests (`db.test.ts`) simulating all three degraded conditions (unsupported,
    blocked, quota-exceeded-on-open, quota-exceeded-on-write), confirming graceful fallback to the
    in-memory adapter, plus write-then-read ordering checks, and a grep-based lint test
    (`singleAccessPoint.test.ts`) enforcing the single-IndexedDB-access-point rule from
    `.kiro/steering/storage.md`.

- **Daily_Challenge generation** - Implemented `selectQuestions` (deterministic, seeded PRNG via
  `src/domain/prng.ts`'s mulberry32 -- no `Math.random()` anywhere) and `getOrCreateDailyChallenge`
  in `src/domain/challenge.ts` (Tasks 7.1, 7.5). Property-based tests in
  `src/domain/challenge.property.test.ts`:
  - **Property 5** - every generated Daily_Challenge has exactly 5 questions, each with exactly 4
    options and exactly 1 correct option (100 runs).
  - **Property 6** - concepts are used distinctly when a lesson has >=5 usable concepts, and
    reused (round-robin) when it has fewer, while always producing exactly 5 questions (100 runs).
  - **Property 7** - calling `getOrCreateDailyChallenge` twice for the same day returns a
    deep-equal challenge both times (idempotent reopen); `selectQuestions` alone is also
    deterministic for the same lesson/seed (30 + 100 runs).
  - **Property 10** - every generated Question has a non-empty explanation/sourceQuote, a
    sourceQuote that's an exact substring of its source concept or section text, a correctly
    linked sectionId, and never draws from a concept lacking a derivable explanation/quote
    (100 + 50 runs).

- All 32 tests pass across tasks 3-5 and 7 combined; build and `npm audit` stayed clean throughout
  (0 vulnerabilities).

## Vibe / Agentic coding
- (not yet used)

## Other
- (not yet used)

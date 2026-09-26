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

- **Grading_Engine** - Implemented `gradeAttempt` (pure, synchronous) and `submitAnswer`
  (orchestration wrapper: rejects invalid/missing options, rejects resubmission on an
  already-answered question, otherwise grades and builds an `Attempt`) in `src/domain/grading.ts`
  (Tasks 8.1, 8.3). Property-based tests in `src/domain/grading.property.test.ts`:
  - **Property 8** - grading is synchronous (no Promise) and `isCorrect` always matches
    `submittedOptionId === correctOptionId`, with `correctOptionId` reported regardless of outcome
    (200 + 200 runs).
  - **Property 9** - resubmitting to an already-answered question returns the prior result
    unchanged, records nothing new, and never mutates the prior Attempt (200 + 100 runs).
  - Also added unit tests (Task 8.5) for undefined/blank/unrecognized option ids, all correctly
    rejected with `{ ok: false, error: { kind: "invalid-option" } }` and no Attempt recorded.

- **Scoring_Engine** - Implemented `calculateScore` (pure: filters to in-scope same-day attempts,
  takes the earliest attempt per question, counts correct first-attempts, rounds and clamps to
  0-100) in `src/domain/scoring.ts` (Task 9.1), matching `.kiro/steering/scoring.md`'s rules.
  Property-based tests in `src/domain/scoring.property.test.ts`:
  - **Property 11** - score depends only on each question's chronologically-first same-day,
    in-scope attempt, is unaffected by array order, and ignores out-of-scope attempts entirely
    (150 + 100 runs, plus 2 targeted first-vs-later-attempt examples).
  - **Property 12** - `calculateScore` never mutates the Attempts array and returns a plain number,
    not a Promise (150 runs).
  - **Property 13** - score is always an integer clamped to [0, 100], even under adversarial
    attempt data (duplicate ids, extreme timestamps, garbage option ids) (200 + 2 boundary runs).

- All 42 tests pass across tasks 3-5 and 7-9 combined (checkpoint 10); build and `npm audit`
  stayed clean throughout (0 vulnerabilities).

### Lesson 4 (cont'd): UI components (Tasks 11-15)
- Built the Challenge_View component tree in `src/ui/`: `ChallengeView` (mount/load/focus-refresh
  shell), `QuestionCard` (accessible `<fieldset>`/radio-group form wired to `submitAnswer`),
  `FeedbackPanel` (`aria-live="polite"` correct/incorrect status + explanation + source quote),
  `ScoreBadge` ("Not assessed yet" vs live `{n}%`), and `StorageFallbackBanner` (dismissible,
  `aria-live="assertive"` degraded-storage warning). All keyboard-operable per
  `.kiro/steering/ui.md` (native radio inputs/buttons, no mouse-only interactions).
- Added `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom`
  as dev dependencies (React 18-compatible versions) to test the component tree; wired jest-dom
  matchers and automatic unmount/cleanup into `vitest.setup.ts`.
- Property-based test in `src/ui/ScoreBadge.property.test.tsx`:
  - **Property 14** - the score rendered by `ScoreBadge` always equals
    `calculateScore(challenge, attempts)` for any non-empty attempts array (100 runs).
- Unit/integration tests: `QuestionCard.test.tsx` (invalid-option error display, and
  already-answered questions redisplaying prior feedback with all inputs disabled),
  `StorageFallbackBanner.test.tsx` (renders per degraded reason, dismissible, disappears when the
  condition resolves), and `ChallengeView.test.tsx` (dateKey computed from local date components
  across a UTC-offset boundary case, and a full mount-to-render integration check against a real
  `fake-indexeddb`-backed Storage_Layer).
- All 53 tests pass (checkpoint 15); build (`tsc -b && vite build`) and `npm audit` stayed clean
  (0 vulnerabilities). Note: `App.tsx` doesn't render `ChallengeView` yet -- that wiring happens in
  Task 16 once `SAMPLE_LESSON` exists to pass in as a real `Lesson`.

### Lesson 4 (cont'd): Sample_Lesson integration and Phase 1 wrap-up (Tasks 16-17)
- Hand-authored `src/data/sampleLesson.ts`: a real study lesson on Web Fundamentals (HTTP, the
  DOM, Git, Big-O), 4 sections x 3-4 concepts each, every concept's `sourceQuote` an exact
  substring of its own `text`, satisfying `validateLesson` with zero errors.
- Wired `Storage_Layer.init()` (`src/storage/db.ts`) to seed `SAMPLE_LESSON` whenever no other
  stored lesson validates, using the storage layer's own fallback-aware methods so seeding works
  identically whether IndexedDB is available or already degraded to in-memory. Idempotent: re-running
  `init()` never duplicates the seed since `id` is the key.
- Wired `src/App.tsx` to call `storage.init()`, resolve the active lesson via `selectActiveLesson`,
  and render the real `ChallengeView` -- the app is now fully playable end-to-end with the sample
  lesson, no API key or account needed.
- Tests added:
  - `sampleLesson.test.ts` - `SAMPLE_LESSON` passes `validateLesson` and every concept's source
    quote is a real substring of its own text.
  - `sampleLessonSeeding.test.ts` - seeding is idempotent, doesn't clobber an existing qualifying
    non-sample lesson, and requires zero `fetch` calls to become available on a fresh `init()`.
  - `smokeEndToEnd.test.ts` - the full loop (generate -> answer all 5, 3 correct/2 wrong on
    purpose -> grade -> score (60%) -> persist -> reload stably) against a real
    `fake-indexeddb`-backed Storage_Layer, with `fetch` mocked to throw if ever called, asserting
    zero network calls throughout (Requirements 10.2, 10.3).
- Fixed one test that assumed `init()` performed no writes -- now that `init()` seeds
  `SAMPLE_LESSON`, a quota-exceeded-write simulation surfaces during `init()` itself rather than on
  a later explicit write; updated the test's expectations to match this (correct) behavior instead
  of changing the implementation.
- All 62 tests pass (final checkpoint 17); production build (`tsc -b && vite build`) succeeds
  (38 modules now bundled, up from 26, confirming `ChallengeView` and its full dependency tree are
  actually reachable from `App.tsx`); `npm audit` stayed clean (0 vulnerabilities). Verified `npm
  run dev` starts and serves the app shell correctly.
- **Phase 1 (core flow) is complete**: lesson structure, bundled sample lesson, daily challenge
  generation, instant grading with source traceability, deterministic first-attempt-only scoring,
  and local-only IndexedDB persistence are all implemented, tested, and wired into a playable app.

## Powers (Lesson 5)

### Lesson 5: Kiro Powers - design-system-scaffold
- Installed the **design-system-scaffold** power from the Kiro powers registry (MIT licensed,
  by DAE-UX) to review our interface standards and accessibility before doing the visual overhaul.
- **Matching keywords**: the power's activation keywords include `design-system`, `accessibility`,
  `ui`, and `theming` -- all directly hit by this task's ask ("give Astra a sleek, modern... design"
  + accessibility review).
- **Usage**: activated the power and read its `design-guidelines.md` and `ui-guidelines.md`
  steering files (not the shadcn/Tailwind component specs, since Astra uses a hand-rolled stack per
  `.kiro/steering/ui.md`, not shadcn -- the power's *heuristics* apply regardless of the underlying
  component library). Concretely used:
  - The **"App Surfaces"** composition guidance ("Linear-style restraint: calm surface hierarchy,
    strong typography and spacing, few colors, dense but readable information, minimal chrome" +
    "avoid dashboard-card mosaics, decorative gradients, multiple competing accent colors") --
    directly shaped the restyle's one-accent-color, low-chrome direction.
  - The **Accessibility Standards (WCAG POUR)** table and **Verification Checklist** (Phase 5) --
    checked visible focus (`:focus-visible` outlines), color never as the sole information carrier
    (correct/incorrect always stated in text, not just tint), sufficient contrast, and native
    keyboard-operable controls (radio inputs, buttons) throughout the new CSS.
  - **Heuristic 6.2** (sparse emphasis, uniform styling) and **8.6** (color accessibility) directly
    informed the Score Badge's dynamic color tiers -- color changes are decorative reinforcement on
    top of the text/number, never instead of it.
- Also read `default-theme.md` (shadCN "New York" theme reference) for token-naming conventions
  (background/foreground/border/muted pairs, light+dark mode pairs) even though Astra's actual CSS
  variables are custom-named for its own plain-CSS stack rather than the shadCN contract.

## Visual Overhaul: Astra restyle (Linear/Notion-inspired)
- Replaced all unstyled raw HTML with a single global stylesheet, `src/index.css` (~370 lines),
  imported once from `main.tsx`. No CSS framework added -- plain CSS custom properties, consistent
  with the project's minimal-dependency approach.
- **Typography**: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, ... sans-serif` stack (no
  network `@import`/`<link>`, keeping the app's zero-network-for-static-assets posture); crisp
  `line-height: 1.55`; a small type scale (1.875rem title / 1.0625rem question / 0.9375rem body /
  0.8125rem pill) for clear hierarchy per heuristic 2.10.
- **Design tokens**: CSS custom properties for color, spacing, radius, and shadow in `:root`, with
  a `prefers-color-scheme: dark` override block -- both light and dark values defined for every
  token, per the power's "components must support both light and dark modes" rule.
- **Header**: centered "Astra" title, today's date (formatted from `dateKey` via
  `toLocaleDateString`), and section pills (HTTP / DOM / Git / Big-O) computed from which
  Lesson_Sections today's 5 questions actually came from -- not hardcoded, so a future custom
  lesson still renders correct pills.
- **Question cards**: `.question-card` (subtle 1px border, `border-radius: 16px`, generous 24px
  padding, soft shadow) containing custom `.option-label` radio tiles with hover (border darkens)
  and `data-selected="true"` (accent border + tint background) states, all still native
  `<input type="radio">` under the hood for full keyboard/AT support.
- **Feedback panel**: `.feedback-panel.correct` / `.incorrect` tinted callout boxes (green/red
  tint + border), with a left-accent-border italic pull-quote style for `sourceQuote`.
- **Score badge**: pill-shaped, with `--low` (red, <50%), `--mid` (amber, 50-79%), `--high`
  (green, >=80%) color variants -- purely decorative on top of the always-present text/number.
- Fixed a React key-uniqueness warning surfaced by the existing `ChallengeView.test.tsx` fixture
  (generic "Section A"/"Section B" titles collapsed to the same fallback short-label) by keying
  section pills on `sectionId` instead of the derived display label.
- Verified against the design-system-scaffold power's Phase 1/2/4/5 Verification Checklist items:
  visual hierarchy, grouping via cards/pills, focus-visible outlines, color-never-sole-carrier,
  and native/keyboard-operable controls throughout.
- All 62 tests still pass after the restyle (`npm run test`); production build succeeds
  (`npm run build`, CSS now bundled at 6.87 kB / 1.89 kB gzipped); `npm audit` stayed clean
  (0 vulnerabilities).

## Vibe / Agentic coding
- (not yet used)

## Other
- (not yet used)

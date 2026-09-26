# Implementation Plan: Daily Study Challenge

## Overview

This plan implements the Daily Study Challenge in four stages, mirroring design.md: (1) project scaffolding and test harness, (2) pure domain logic and the Storage_Layer with property-based tests for all 15 correctness properties, (3) the React UI wired to that domain/storage layer, and (4) the bundled Sample_Lesson plus an end-to-end smoke test. Language/stack: TypeScript, Vite, React 18, Vitest, fast-check, fake-indexeddb (per design.md's Tech Stack table — no pseudocode was used in the design, so no language selection is needed).

## Tasks

- [x] 1. Set up project scaffolding and testing infrastructure
  - [x] 1.1 Initialize Vite + TypeScript + React project structure
    - Scaffold the app with `vite` (react-ts template), configure `tsconfig.json` with strict mode
    - Create the folder structure from design.md: `src/storage/`, `src/domain/`, `src/data/`, `src/ui/`
    - _Requirements: N/A (project setup); Design: Tech Stack, Architecture_

  - [x] 1.2 Configure Vitest, fast-check, and fake-indexeddb test harness
    - Add Vitest config (shared transform with Vite), install `fast-check` and `fake-indexeddb`
    - Add a test setup file that installs `fake-indexeddb`'s global `indexedDB` for the Storage_Layer's test environment
    - Write one trivial smoke test to confirm the harness runs
    - _Requirements: N/A (project setup); Design: Testing Strategy_

- [ ] 2. Checkpoint - ensure build and test harness run cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Define core data model types
  - [x] 3.1 Create TypeScript interfaces for the data model
    - Implement `Concept`, `LessonSection`, `Lesson`, `AnswerOption`, `Question`, `DailyChallenge`, `Attempt` exactly as specified in design.md's Data Models section
    - _Requirements: 1.1, 1.2; Design: Data Models_

- [x] 4. Implement Lesson validation and active-lesson selection
  - [x] 4.1 Implement `validateLesson`
    - Check exactly 4 sections; each section's trimmed title (1-100 chars), trimmed explanation (1-2000 chars), and concept count (1-20); collect all violations (not just the first) into `errors`
    - _Requirements: 1.1, 1.2, 1.4, 1.5; Design: Domain: validateLesson_

  - [x]* 4.2 Write property test for Lesson section-count validity
    - **Property 1: Lesson section-count validity**
    - **Validates: Requirements 1.1, 1.4**

  - [x]* 4.3 Write property test for Lesson section field validity
    - **Property 2: Lesson section field validity**
    - **Validates: Requirements 1.2, 1.5**

  - [x] 4.4 Implement `selectActiveLesson`
    - Return the first stored lesson (excluding the sample) that passes `validateLesson`; fall back to `SAMPLE_LESSON` if none qualifies
    - _Requirements: 2.3; Design: Domain: selectActiveLesson_

  - [x]* 4.5 Write property test for active lesson selection fallback
    - **Property 4: Active lesson selection falls back to the Sample_Lesson**
    - **Validates: Requirements 2.3**

- [ ] 5. Implement Storage_Layer (`src/storage/db.ts`)
  - [x] 5.1 Implement IndexedDB schema v1 and typed CRUD API
    - Implement `init()`, `getLesson`/`putLesson`/`listLessons`, `getDailyChallenge`/`putDailyChallenge`, `getAttempts`/`putAttempt`
    - Create object stores `lessons`, `dailyChallenges`, `attempts` (with `by_dateKey` and `by_question` indexes) via `onupgradeneeded`, guarded by `if (oldVersion < 1)` per design.md's versioning comment convention
    - Ensure each `put*` promise resolves only after its underlying transaction completes
    - _Requirements: 9.1, 9.2; Design: Storage_Layer, Schema_

  - [x]* 5.2 Write property test for section order preserved on storage round-trip
    - **Property 3: Section order is preserved on load**
    - **Validates: Requirements 1.3**

  - [x]* 5.3 Write property test for Storage_Layer round-tripping Daily_Challenge and Attempts
    - **Property 15: Storage round-trips a Daily_Challenge and its Attempts**
    - **Validates: Requirements 9.5**

  - [x] 5.4 Implement `StorageStatus`, `getStorageStatus`, and the in-memory fallback adapter
    - Wrap `indexedDB.open` in a promise; map `onerror`/`onblocked`/feature-detection failure to `{ kind: "degraded", reason, message }`
    - On degraded status, swap to an in-memory `Map`-backed adapter implementing the same `StorageLayer` interface, without touching/deleting already-persisted IndexedDB records
    - _Requirements: 9.3, 9.4; Design: Storage_Layer error handling / fallback_

  - [x]* 5.5 Write unit tests for IndexedDB failure modes
    - Simulate `unsupported`, `blocked`, and `quota-exceeded` conditions; assert fallback status is reported and pre-existing persisted records remain untouched
    - _Requirements: 9.3, 9.4_

  - [x]* 5.6 Write unit test for write-then-read ordering
    - Assert the promise returned by a `put*` call does not resolve before its transaction completes, using `fake-indexeddb`
    - _Requirements: 9.1_

  - [x]* 5.7 Write lint-style unit test enforcing single access point
    - Grep-based test asserting no module other than `src/storage/db.ts` references the global `indexedDB`
    - _Requirements: 9.2_

- [x] 6. Checkpoint - ensure Lesson and Storage_Layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Daily_Challenge generation
  - [x] 7.1 Implement `selectQuestions` pure helper (`src/domain/challenge.ts`)
    - Flatten a lesson's concepts into a pool tagged with `sectionId`; filter out concepts lacking a derivable `explanation`/`sourceQuote`
    - Deterministically shuffle with a seeded PRNG (seed = `dateKey + ":" + lesson.id`, e.g. mulberry32) — no `Math.random()`
    - Select first 5 distinct concepts if pool size >= 5, otherwise round-robin-reuse the shuffled pool until 5 are produced
    - Build each `Question`: correct option from the concept's fact, 3 deterministically-drawn distractor options, options shuffled into a seeded order, `sectionId`/`explanation`/`sourceQuote` attached
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 5.3, 5.4; Design: Domain: generateDailyChallenge_

  - [x]* 7.2 Write property test for generated Daily_Challenge shape
    - **Property 5: Generated Daily_Challenge has the required shape**
    - **Validates: Requirements 3.1, 3.3, 3.4**

  - [x]* 7.3 Write property test for concept usage distinctness and reuse
    - **Property 6: Concept usage respects distinctness and reuse rules**
    - **Validates: Requirements 3.2, 3.6**

  - [x]* 7.4 Write property test for Question traceability
    - **Property 10: Every generated Question is traceable to its source**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 7.5 Implement `getOrCreateDailyChallenge`
    - Read `storage.getDailyChallenge(dateKey)`; if present return unchanged; otherwise call `selectQuestions`, wrap in a `DailyChallenge`, persist via `storage.putDailyChallenge`, and return it
    - Compute `dateKey` from the device's local date (`getFullYear/getMonth/getDate`, not UTC)
    - _Requirements: 3.1, 3.5, 9.5; Design: Domain: generateDailyChallenge, Calendar day determination_

  - [x]* 7.6 Write property test for idempotent reopening
    - **Property 7: Reopening the Challenge_View is idempotent**
    - **Validates: Requirements 3.5**

- [x] 8. Implement Grading_Engine (`src/domain/grading.ts`)
  - [x] 8.1 Implement `gradeAttempt`
    - Pure, synchronous: given any of a question's 4 option ids, return `isCorrect`, `correctOptionId`, and the correct option's `explanation`/`sourceQuote`
    - _Requirements: 4.1, 4.2; Design: Grading_Engine_

  - [x]* 8.2 Write property test for synchronous, correct grading
    - **Property 8: Grading is synchronous and reports correctness against the true correct option**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 8.3 Implement `submitAnswer`
    - Reject `undefined`/blank/unrecognized option ids without grading or recording anything
    - Reject a second submission for a question with an existing same-day `Attempt`, returning the previously computed result unchanged
    - Otherwise grade, build an `Attempt` (with `submittedAt`), and return it for the caller to persist
    - _Requirements: 4.3, 4.4; Design: Grading_Engine_

  - [x]* 8.4 Write property test for rejecting further submissions on answered Questions
    - **Property 9: An answered Question rejects further submissions**
    - **Validates: Requirements 4.3**

  - [x]* 8.5 Write unit test for invalid/missing option submissions
    - Assert `submitAnswer` returns `{ ok: false, error: { kind: "invalid-option" } }` and records no Attempt for undefined, blank, or unrecognized option ids
    - _Requirements: 4.4_

- [x] 9. Implement Scoring_Engine (`src/domain/scoring.ts`)
  - [x] 9.1 Implement `calculateScore`
    - Filter attempts to the challenge's `dateKey` and question ids; group by `questionId` and take the earliest `submittedAt` per group (stable tiebreak); count correct first-attempts; compute `round(correct/total*100)` clamped to 0-100; do not mutate the input array
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 8.1; Design: Scoring_Engine_

  - [x]* 9.2 Write property test for first-attempt-only, order-independent scoring
    - **Property 11: Score reflects only first, in-scope attempts, order-independently**
    - **Validates: Requirements 6.1, 6.3, 7.1, 7.2, 7.3**

  - [x]* 9.3 Write property test for scoring purity
    - **Property 12: Scoring is pure**
    - **Validates: Requirements 6.2**

  - [x]* 9.4 Write property test for score clamping
    - **Property 13: Score is always clamped to 0-100**
    - **Validates: Requirements 8.1**

- [x] 10. Checkpoint - ensure all domain-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement Challenge_View shell and data loading
  - [ ] 11.1 Implement `ChallengeView` mount logic
    - On mount, compute `dateKey`, call `getOrCreateDailyChallenge`, load same-day `Attempts` via the Storage_Layer, hold both in React state; recompute `dateKey` on window focus
    - _Requirements: 3.1, 3.5, 9.5; Design: UI: Challenge_View_

  - [ ]* 11.2 Write unit test for local-date `dateKey` computation
    - Assert `dateKey` is derived from local date components, not UTC, across a UTC-offset boundary case
    - _Requirements: 9.5_

- [ ] 12. Implement QuestionCard and FeedbackPanel
  - [ ] 12.1 Implement `QuestionCard`
    - Render a `<fieldset>`/`<legend>` with the question prompt and 4 radio `<input>` options plus a submit `<button>`; disable/read-only options once answered
    - _Requirements: 4.1; Design: UI: QuestionCard_

  - [ ] 12.2 Implement `FeedbackPanel`
    - Render correct/incorrect status in an `aria-live="polite"` region, highlight the Correct_Option, display `explanation` and `sourceQuote`
    - _Requirements: 4.2, 5.1, 5.2; Design: UI: FeedbackPanel_

  - [ ] 12.3 Wire QuestionCard submission to `submitAnswer` and persistence
    - On submit, call `submitAnswer`; on success persist the returned Attempt via `storage.putAttempt` and update state; on `invalid-option` show an inline error tied to the option list via `aria-describedby`; on `already-answered` redisplay the prior `FeedbackPanel`; restore answered state from any prior Attempt on load
    - _Requirements: 4.1, 4.3, 4.4; Design: UI: Challenge_View, Error Handling table_

  - [ ]* 12.4 Write unit test for invalid submission handling
    - Assert an inline error appears and no Attempt is recorded for a missing/invalid option
    - _Requirements: 4.4_

  - [ ]* 12.5 Write unit test for answered-question redisplay
    - Assert a question with an existing same-day Attempt redisplays its prior feedback and rejects further submissions
    - _Requirements: 4.3_

- [ ] 13. Implement ScoreBadge
  - [ ] 13.1 Implement `ScoreBadge`
    - Render literal "Not assessed yet" when there are zero attempts for the day; otherwise render `calculateScore(challenge, attempts)` as `"{n}%"`, recomputed on every attempt change
    - _Requirements: 8.2, 8.3; Design: UI: ScoreBadge_

  - [ ]* 13.2 Write property test for displayed score matching the pure calculation
    - **Property 14: Displayed score matches the pure calculation**
    - **Validates: Requirements 8.3**

- [ ] 14. Implement StorageFallbackBanner
  - [ ] 14.1 Implement `StorageFallbackBanner`
    - Render only when `getStorageStatus().kind === "degraded"`; dismissible; `aria-live="assertive"` on first appearance; stays visible until dismissed or the condition resolves
    - _Requirements: 9.3, 9.4; Design: UI: StorageFallbackBanner_

  - [ ]* 14.2 Write unit test for fallback banner visibility
    - Assert the banner appears on degraded status and remains visible until dismissed or the next successful init
    - _Requirements: 9.3, 9.4_

- [ ] 15. Checkpoint - ensure all UI tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Author and integrate the Sample_Lesson
  - [ ] 16.1 Author `sampleLesson.ts` content
    - Hand-author `SAMPLE_LESSON`: exactly 4 `LessonSection`s, each with a title, explanation, and 1-20 concepts satisfying `validateLesson`'s bounds
    - _Requirements: 2.4; Design: Sample_Lesson_

  - [ ]* 16.2 Write unit test asserting `SAMPLE_LESSON` passes `validateLesson`
    - _Requirements: 2.4_

  - [ ] 16.3 Wire `Storage_Layer.init()` to seed `SAMPLE_LESSON`
    - On `init()`, call `listLessons()`; if no lesson other than the sample validates, idempotently `putLesson(SAMPLE_LESSON)` (safe to re-run since `id` is the key)
    - _Requirements: 2.1, 2.3; Design: Sample_Lesson_

  - [ ]* 16.4 Write unit test for zero-network, zero-prior-state sample availability
    - Mock `fetch`/`XMLHttpRequest` and assert never called; assert the sample lesson is available on a fresh `init()` with no prior storage state
    - _Requirements: 2.1, 2.2_

  - [ ]* 16.5 Write end-to-end smoke test for the full daily-challenge flow
    - Using `SAMPLE_LESSON` with network mocked: generate the Daily_Challenge, answer all 5 questions, verify grading and score, verify persistence through the Storage_Layer, and assert zero network calls throughout
    - _Requirements: 10.2, 10.3; Design: Testing Strategy_

- [ ] 17. Final checkpoint - ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and are not implemented automatically during task execution.
- Property-based tests (Vitest + `fast-check`, minimum 100 runs each) are placed immediately after the implementation task they validate, per design.md's Testing Strategy.
- Each property test task references its Property number and the design.md Correctness Properties section for full detail; do not restate the property text when implementing — read it from design.md.
- Requirement references point to specific acceptance criteria numbers in requirements.md, not just user story numbers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "5.1", "7.1"] },
    { "id": 4, "tasks": ["4.4", "5.4", "7.5", "8.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.5", "5.2", "5.3", "5.5", "5.6", "5.7", "7.2", "7.3", "7.4", "7.6", "8.2"] },
    { "id": 6, "tasks": ["8.3", "9.1"] },
    { "id": 7, "tasks": ["8.4", "8.5", "9.2", "9.3", "9.4"] },
    { "id": 8, "tasks": ["11.1"] },
    { "id": 9, "tasks": ["11.2", "12.1"] },
    { "id": 10, "tasks": ["12.2", "13.1", "14.1"] },
    { "id": 11, "tasks": ["12.3"] },
    { "id": 12, "tasks": ["12.4", "12.5", "13.2", "14.2"] },
    { "id": 13, "tasks": ["16.1"] },
    { "id": 14, "tasks": ["16.2", "16.3"] },
    { "id": 15, "tasks": ["16.4"] },
    { "id": 16, "tasks": ["16.5"] }
  ]
}
```

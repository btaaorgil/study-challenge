# Requirements Document

## Introduction

The Daily Study Challenge is a local-only, single-user web app. Each day, the app presents the user with a short multiple-choice quiz drawn from lesson content, grades answers instantly, and tracks a deterministic score. Phase 1 covers the core loop: lesson content structure, the daily challenge itself, grading and feedback, scoring rules, and local persistence. The app ships with one bundled sample lesson so a user can complete a full daily challenge without configuring an API key or any external service.

## Glossary

- **System**: The Daily Study Challenge web application as a whole.
- **Lesson**: A unit of study content made up of exactly 4 Lesson_Sections, from which Daily_Challenge questions are drawn.
- **Lesson_Section**: A titled part of a Lesson containing a title, an explanation, and one or more Concepts.
- **Concept**: A discrete fact or idea within a Lesson_Section that a Question can test.
- **Sample_Lesson**: A Lesson bundled with the System's installation, available without an API key or network access.
- **Daily_Challenge**: The set of exactly 5 Questions presented to the user for the current calendar day.
- **Question**: A multiple-choice item with exactly 4 Answer_Options, exactly one of which is the Correct_Option.
- **Answer_Option**: One of the 4 selectable choices belonging to a Question.
- **Correct_Option**: The single Answer_Option marked as correct for a Question.
- **Attempt**: A recorded submission of an Answer_Option by the user for a specific Question on a specific calendar day.
- **Source_Quote**: The exact substring of Lesson content that supports the Correct_Option, used to trace the answer back to its Lesson_Section.
- **Grading_Engine**: The System component that evaluates a submitted Attempt and produces feedback.
- **Scoring_Engine**: The System component that computes the Score from recorded Attempts. Implemented as a pure function.
- **Score**: A numeric percentage in the range 0-100, inclusive, representing the user's performance on the current day's Daily_Challenge.
- **Storage_Layer**: The System component that wraps all IndexedDB access; the only component permitted to read or write persisted data.
- **Challenge_View**: The user interface presenting the Daily_Challenge questions, options, and feedback.

## Requirements

### Requirement 1: Lesson Content Structure

**User Story:** As a learner, I want each lesson organized into clearly titled sections, so that I can study concepts in a predictable structure before being quizzed on them.

#### Acceptance Criteria

1. THE System SHALL organize every Lesson into exactly 4 Lesson_Sections.
2. THE System SHALL require every Lesson_Section to have a non-empty title (after trimming leading and trailing whitespace) of at most 100 characters, a non-empty explanation (after trimming leading and trailing whitespace) of at most 2000 characters, and at least 1 and at most 20 Concepts.
3. WHEN a Lesson is loaded, THE System SHALL preserve the order of its 4 Lesson_Sections as authored.
4. IF a Lesson does not contain exactly 4 Lesson_Sections, THEN THE System SHALL reject the Lesson, SHALL NOT present it in a Daily_Challenge, and SHALL indicate to the caller that the Lesson was rejected.
5. IF any Lesson_Section within a Lesson does not satisfy the title, explanation, or Concept requirements defined in Criterion 2, THEN THE System SHALL reject the Lesson, SHALL NOT present it in a Daily_Challenge, and SHALL indicate to the caller that the Lesson was rejected.

### Requirement 2: Bundled Sample Lesson

**User Story:** As a first-time user, I want a lesson already included with the app, so that I can start a daily challenge immediately without an API key or any setup.

#### Acceptance Criteria

1. THE System SHALL package exactly one Sample_Lesson with the application's deployed codebase such that it is available for use immediately on the System's first load, without requiring any download, file selection, or configuration by the user.
2. THE System SHALL make the Sample_Lesson available for a Daily_Challenge without any API key, account, or network request.
3. IF no Lesson other than the Sample_Lesson exists in the Storage_Layer that satisfies the structural requirements defined in Requirement 1, THEN THE System SHALL use the Sample_Lesson as the source for the Daily_Challenge.
4. THE Sample_Lesson SHALL satisfy the structural requirements defined in Requirement 1.

### Requirement 3: Daily Challenge Question Set

**User Story:** As a learner, I want a short daily quiz drawn from a lesson, so that I can test my understanding in a few minutes each day.

#### Acceptance Criteria

1. WHEN a user opens the Challenge_View for a calendar day that has no existing Daily_Challenge, THE System SHALL generate a Daily_Challenge containing exactly 5 Questions.
2. THE System SHALL derive every Question in a Daily_Challenge from the Concepts of a single available Lesson, using distinct Concepts across the 5 Questions whenever the Lesson has at least 5 distinct Concepts.
3. THE System SHALL give every Question exactly 4 Answer_Options.
4. THE System SHALL mark exactly one Answer_Option per Question as the Correct_Option.
5. WHEN a user opens the Challenge_View for a calendar day that already has a generated Daily_Challenge, THE System SHALL present the previously generated 5 Questions unchanged, including the same Question order, the same Answer_Options per Question, the same Answer_Option order, and the same Correct_Option designation as originally generated.
6. IF the Lesson used to generate a Daily_Challenge has fewer than 5 distinct Concepts, THEN THE System SHALL reuse Concepts as needed to produce exactly 5 Questions.

### Requirement 4: Answer Submission and Instant Grading

**User Story:** As a learner, I want to see immediately whether my answer was correct, so that I can learn from mistakes without waiting.

#### Acceptance Criteria

1. WHEN a user submits an Answer_Option for a Question, THE Grading_Engine SHALL evaluate the submission, and THE Challenge_View SHALL display the graded result within the same interaction, without requiring a page reload or any additional user input.
2. WHEN THE Grading_Engine evaluates a submitted Answer_Option, THE Challenge_View SHALL display whether the submitted Answer_Option was correct or incorrect, and SHALL display the Correct_Option for that Question, regardless of whether the submitted Answer_Option was correct.
3. IF a Question in the current Daily_Challenge already has a recorded Attempt for the current calendar day, THEN THE Challenge_View SHALL display the previously displayed correctness status and Correct_Option for that Question, and SHALL NOT accept, evaluate, or record any further Answer_Option submission for that Question for the remainder of the current calendar day.
4. IF a user submits a Question without selecting an Answer_Option, or submits an Answer_Option that is not one of that Question's 4 Answer_Options, THEN THE Grading_Engine SHALL reject the submission, SHALL NOT record an Attempt, and THE Challenge_View SHALL display an error message indicating that a valid Answer_Option must be selected.

### Requirement 5: Explanation and Source Traceability

**User Story:** As a learner, I want an explanation and the exact lesson text behind the correct answer, so that I can verify and understand why an answer is correct.

#### Acceptance Criteria

1. WHEN THE Grading_Engine displays a graded result for a Question, THE Challenge_View SHALL display a non-empty explanation of the Correct_Option.
2. WHEN THE Grading_Engine displays a graded result for a Question, THE Challenge_View SHALL display a Source_Quote that is a non-empty, exact substring of the originating Lesson_Section's explanation or Concept text.
3. WHEN a Question is generated for a Daily_Challenge, THE System SHALL associate that Question with exactly one Lesson_Section that its Source_Quote was drawn from.
4. IF a Question's Correct_Option does not have both a non-empty explanation and a non-empty Source_Quote, THEN THE System SHALL exclude that Question from the Daily_Challenge.

### Requirement 6: Deterministic Scoring Calculation

**User Story:** As a learner, I want my daily score calculated consistently, so that I can trust the number reflects only my actual answers.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL be implemented as a pure function that, given the same set of recorded Attempts for a calendar day regardless of the order in which those Attempts are provided, SHALL always return the same Score.
2. THE Scoring_Engine SHALL produce no side effects, SHALL NOT invoke the Storage_Layer or make any network call, and SHALL NOT mutate the Attempts it receives as input.
3. THE Scoring_Engine SHALL compute the Score as the percentage of the Daily_Challenge's 5 Questions answered correctly, using only the Attempts recorded for the current calendar day's Daily_Challenge and excluding any Attempt associated with a different calendar day or with a Question outside that Daily_Challenge.

### Requirement 7: First-Attempt-Only Scoring Rule

**User Story:** As a learner, I want only my first answer per question to count, so that guessing repeatedly does not inflate my score.

#### Acceptance Criteria

1. WHEN a user submits an Answer_Option for a Question and no Attempt has previously been recorded for that Question on the current calendar day, THE Scoring_Engine SHALL count that Attempt toward the Score for that day.
2. IF a user submits an Answer_Option for a Question for which an Attempt has already been recorded on the current calendar day, THEN THE Scoring_Engine SHALL use the chronological order in which Attempts were submitted to determine the first recorded Attempt for that Question, and SHALL exclude every subsequent Attempt for that Question from the Score calculation.
3. IF the first recorded Attempt for a Question on the current calendar day selects an Answer_Option other than the Correct_Option, THEN THE Scoring_Engine SHALL NOT increase the Score as a result of that Attempt.

### Requirement 8: Score Bounds and Unassessed State

**User Story:** As a learner, I want to see a clear "not assessed" state before I've answered anything, and a score that always makes sense, so that I'm never confused by a misleading number.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL clamp the Score to a range of 0 to 100 inclusive.
2. WHILE no Attempts have been recorded for the current calendar day's Daily_Challenge, THE Challenge_View SHALL display "Not assessed yet" in place of a numeric Score.
3. WHEN any Attempt is recorded for the current calendar day's Daily_Challenge, THE Challenge_View SHALL display the numeric Score computed by the Scoring_Engine, updated to reflect that Attempt, in place of any previously displayed Score or "Not assessed yet" message.

### Requirement 9: Local Persistence

**User Story:** As a user, I want my lessons, challenges, and answers saved on my device, so that my progress survives page reloads without needing an account.

#### Acceptance Criteria

1. WHEN a Lesson, Daily_Challenge, or Attempt is created or updated, THE Storage_Layer SHALL persist the change to IndexedDB before the triggering operation is considered complete.
2. THE System SHALL route all reads and writes of Lessons, Daily_Challenges, and Attempts through the Storage_Layer.
3. IF an IndexedDB operation fails due to a blocked, unsupported, or quota-exceeded condition, THEN THE System SHALL display a fallback message in the user interface that remains visible until the user dismisses it or the condition is resolved, and SHALL retain any Lessons, Daily_Challenges, and Attempts already persisted prior to the failure.
4. IF the Storage_Layer cannot persist data due to a blocked, unsupported, or quota-exceeded condition, THEN THE System SHALL allow the user to continue completing the current calendar day's Daily_Challenge using in-memory data for the remainder of the browser session.
5. WHEN the user reloads the Challenge_View on the same calendar day, as determined by the device's local date, THE System SHALL restore the previously generated Daily_Challenge and its recorded Attempts from the Storage_Layer.

### Requirement 10: Local-Only Operation

**User Story:** As a privacy-conscious user, I want the app to work entirely offline with no account, so that none of my data leaves my device.

#### Acceptance Criteria

1. THE System SHALL operate without any user account, login, or authentication step.
2. THE System SHALL NOT make any network call to store, sync, or retrieve Lessons, Daily_Challenges, or Attempts.
3. WHILE the Sample_Lesson is the active Lesson, THE System SHALL generate, grade, and score a full Daily_Challenge and persist its Attempts through the Storage_Layer without initiating any network request.

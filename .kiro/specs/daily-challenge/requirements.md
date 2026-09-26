# Requirements Document

## Introduction

Studyy is a local-only, single-user web app that turns a learner's own lesson notes into quizzes. The learner adds a lesson first; Studyy splits it into one section per topic the lesson teaches, then offers a short Daily Challenge each day and an on-demand "Test Yourself" exam over the whole lesson, at a chosen difficulty. Answers are graded instantly and scored deterministically. Phase 1 (Requirements 1-10) covers the core loop: lesson content structure, the daily challenge itself, grading and feedback, scoring rules, and local persistence. Phase 2 (Requirements 11-14) covers the upload-first flow, topic detection, difficulty, the Test Yourself exam, and topic insights. The app ships with one bundled sample lesson so a user can try a full daily challenge without any notes, API key, or external service.

## Glossary

- **System**: The Studyy web application as a whole.
- **Lesson**: A unit of study content made up of 1 to 12 Lesson_Sections (one per topic it teaches), from which Daily_Challenge and Exam questions are drawn.
- **Lesson_Section**: A titled part of a Lesson covering one topic, containing a title, an explanation, and one or more Concepts.
- **Lesson_Importer**: The System component that turns pasted notes into a Lesson, locally and without a network call.
- **Difficulty**: One of Easy, Normal, or Hard; controls how Questions are built, never how they are scored.
- **Exam**: An on-demand "Test Yourself" question set covering every Lesson_Section of the active Lesson, separate from the Daily_Challenge.
- **Exam_Result**: A finished Exam's totals and per-Lesson_Section breakdown.
- **Topic_Insight**: The panel beside each Question showing a cited fun fact or history note for the topic, or key terms and a recap from the learner's own notes.
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

1. THE System SHALL organize every Lesson into between 1 and 12 Lesson_Sections, one per topic the Lesson teaches (the count follows the content; it is not fixed).
2. THE System SHALL require every Lesson_Section to have a non-empty title (after trimming leading and trailing whitespace) of at most 100 characters, a non-empty explanation (after trimming leading and trailing whitespace) of at most 2000 characters, and at least 1 and at most 20 Concepts.
3. WHEN a Lesson is loaded, THE System SHALL preserve the order of its Lesson_Sections as authored.
4. IF a Lesson contains fewer than 1 or more than 12 Lesson_Sections, THEN THE System SHALL reject the Lesson, SHALL NOT present it in a Daily_Challenge, and SHALL indicate to the caller that the Lesson was rejected.
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
3. THE System SHALL give every Question exactly 4 Answer_Options at Normal and Hard Difficulty, and exactly 3 at Easy Difficulty (Requirement 11).
4. THE System SHALL mark exactly one Answer_Option per Question as the Correct_Option.
5. WHEN a user opens the Challenge_View for a calendar day that already has a generated Daily_Challenge, THE System SHALL present the previously generated 5 Questions unchanged, including the same Question order, the same Answer_Options per Question, the same Answer_Option order, and the same Correct_Option designation as originally generated.
6. IF the Lesson used to generate a Daily_Challenge has fewer than 5 distinct Concepts, THEN THE System SHALL reuse Concepts as needed to produce exactly 5 Questions.

### Requirement 4: Answer Submission and Instant Grading

**User Story:** As a learner, I want to see immediately whether my answer was correct, so that I can learn from mistakes without waiting.

#### Acceptance Criteria

1. WHEN a user submits an Answer_Option for a Question, THE Grading_Engine SHALL evaluate the submission, and THE Challenge_View SHALL display the graded result within the same interaction, without requiring a page reload or any additional user input.
2. WHEN THE Grading_Engine evaluates a submitted Answer_Option, THE Challenge_View SHALL display whether the submitted Answer_Option was correct or incorrect, and SHALL display the Correct_Option for that Question, regardless of whether the submitted Answer_Option was correct.
3. IF a Question in the current Daily_Challenge already has a recorded Attempt for the current calendar day, THEN THE Challenge_View SHALL display the previously displayed correctness status and Correct_Option for that Question, and SHALL NOT accept, evaluate, or record any further Answer_Option submission for that Question for the remainder of the current calendar day.
4. IF a user submits a Question without selecting an Answer_Option, or submits an Answer_Option that is not one of that Question's Answer_Options, THEN THE Grading_Engine SHALL reject the submission, SHALL NOT record an Attempt, and THE Challenge_View SHALL display an error message indicating that a valid Answer_Option must be selected.

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

## Phase 2: Upload-first study flow

### Requirement 11: Difficulty

**User Story:** As a learner, I want to choose Easy, Normal, or Hard, so that questions get genuinely harder as I get more confident.

#### Acceptance Criteria

1. THE System SHALL let the user choose a Difficulty of Easy, Normal, or Hard from the lesson dashboard, and SHALL remember the choice across reloads through the Storage_Layer.
2. WHEN generating Questions at Easy Difficulty, THE System SHALL give each Question 3 Answer_Options, SHALL name the Question's Lesson_Section in the prompt, and SHALL prefer wrong Answer_Options drawn from other Lesson_Sections.
3. WHEN generating Questions at Normal Difficulty, THE System SHALL prefer fill-in-the-blank Questions in which a key term of a Concept's own sentence is blanked out and the wrong Answer_Options are other terms of the same kind from the Lesson.
4. WHEN generating Questions at Hard Difficulty, THE System SHALL blank out the most specific term of the sentence, SHALL prefer look-alike wrong Answer_Options from the same Lesson_Section, and SHALL NOT name the Lesson_Section in the prompt.
5. THE System SHALL NOT offer, as a wrong Answer_Option of a fill-in-the-blank Question, any term that appears in that Question's sentence or that differs from the Correct_Option only by a plural ending.
6. IF the current calendar day's Daily_Challenge already has a recorded Attempt, THEN THE System SHALL keep that Daily_Challenge at the Difficulty it was generated with for the rest of the day, and SHALL apply a newly chosen Difficulty to Exams immediately and to the next day's Daily_Challenge.
7. THE Scoring_Engine SHALL compute the Score identically at every Difficulty.

### Requirement 12: Test Yourself Exam

**User Story:** As a learner, I want a "Test Yourself" button I can press whenever I feel ready, so that I can check how well I understand the whole lesson.

#### Acceptance Criteria

1. THE System SHALL make the Exam available from the lesson dashboard at any time, without requiring the Daily_Challenge to be completed first.
2. WHEN the user starts an Exam, THE System SHALL generate Questions covering every Lesson_Section of the active Lesson that has a usable Concept, asking each usable Concept at most once, up to 20 Questions, and reusing Concepts only when the Lesson has fewer than 5 usable Concepts.
3. THE System SHALL generate Exam Questions at the user's chosen Difficulty.
4. WHEN the user finishes an Exam, THE System SHALL show the overall percentage correct and a per-Lesson_Section breakdown, and SHALL name the Lesson_Sections scored below 70% as ones to review.
5. WHEN the user finishes an Exam, THE System SHALL persist an Exam_Result through the Storage_Layer, and SHALL NOT record Exam answers as Daily_Challenge Attempts or let them affect the daily Score.
6. WHEN the user retakes an Exam, THE System SHALL generate a new question order and new Answer_Option arrangement.

### Requirement 13: Upload-first Lesson Import and Topic Detection

**User Story:** As a learner, I want adding my notes to be the first thing I see, and I want them split by what they actually teach, so that a lesson about 2 things becomes 2 sections instead of a fixed number.

#### Acceptance Criteria

1. WHILE no Lesson has been chosen as active, THE System SHALL open on the lesson import screen, with an optional shortcut to the Sample_Lesson.
2. THE Lesson_Importer SHALL accept pasted text and local `.txt`/`.md` files read in the browser, and SHALL NOT upload them anywhere.
3. WHEN the pasted notes contain headings (markdown `#` headings, "Chapter/Part/Topic N" lines, "Label:" lines, or short standalone title lines followed by body text), THE Lesson_Importer SHALL create one Lesson_Section per heading, using the heading as its title.
4. WHEN the pasted notes contain no headings, THE Lesson_Importer SHALL start a new Lesson_Section wherever the subject changes between paragraphs, or within a single paragraph, and SHALL title each Lesson_Section by its subject.
5. THE Lesson_Importer SHALL use only the learner's own sentences and bullet points, unmodified, as Concept text and Source_Quote.
6. IF the notes contain fewer than 3 sentences or bullet points, THEN THE Lesson_Importer SHALL reject them with an explanatory message and SHALL NOT create a Lesson.
7. WHEN a Lesson is imported, THE System SHALL show the detected Lesson_Sections for confirmation, SHALL save the Lesson, SHALL make it the active Lesson, and SHALL build the current day's Daily_Challenge from it.

### Requirement 14: Topic Insights

**User Story:** As a learner, I want fun facts and history to sit next to the question they relate to, so that they add context without getting in the way.

#### Acceptance Criteria

1. THE Challenge_View and the Exam SHALL show a Topic_Insight beside each Question for that Question's Lesson_Section.
2. WHERE the Lesson_Section has cited facts bundled with the System, THE Topic_Insight SHALL show one of them with its source.
3. WHERE the Lesson_Section has no bundled facts, THE Topic_Insight SHALL show key terms and a recap from the learner's own notes, and SHALL NOT present invented facts.
4. WHILE the Difficulty is Normal or Hard and the current Question is unanswered, THE Topic_Insight SHALL stay locked; at Easy it SHALL be visible before answering as a hint.
5. THE lesson dashboard SHALL show one card per Lesson_Section with its title, a short excerpt, key terms, and any cited history fact.

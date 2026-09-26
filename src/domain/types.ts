// Core data model for the Daily Study Challenge domain.
// Mirrors the requirements.md Glossary and design.md's Data Models section exactly:
// Lesson -> LessonSection -> Concept, Question -> AnswerOption/correctOptionId,
// DailyChallenge (exactly 5 Questions), and Attempt (the unit Scoring_Engine consumes).

export interface Concept {
  id: string;
  text: string; // the fact/idea itself
  explanation: string; // >0 chars when usable for a question
  sourceQuote: string; // exact substring of `text` or the parent section's explanation
}

export interface LessonSection {
  id: string;
  title: string; // trimmed, 1-100 chars
  explanation: string; // trimmed, 1-2000 chars
  concepts: Concept[]; // 1-20 items
}

export interface Lesson {
  id: string;
  title: string;
  sections: LessonSection[]; // exactly 4, order = authored order
}

export interface AnswerOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  sectionId: string; // the one LessonSection this question traces back to
  conceptId: string;
  prompt: string;
  options: AnswerOption[]; // exactly 4
  correctOptionId: string; // one of options[].id
  explanation: string; // non-empty
  sourceQuote: string; // non-empty, exact substring of section content
}

export interface DailyChallenge {
  dateKey: string; // "YYYY-MM-DD", local date
  lessonId: string;
  questions: Question[]; // exactly 5, fixed order once created
}

export interface Attempt {
  id: string; // `${dateKey}:${questionId}:${submittedAt}`
  dateKey: string;
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  submittedAt: number; // epoch ms, used for first-attempt chronological ordering
}

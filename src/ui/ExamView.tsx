// ExamView: "Exam Mode" -- a comprehensive, multi-section exam built via
// domain/challenge.ts's buildExam (draws questions from every section of
// the lesson, not just the day's pooled 5). Presented one question at a
// time like the Daily Challenge, but scored and summarized independently --
// exam attempts are NOT persisted as Daily_Challenge Attempts and do not
// affect the daily Score (Requirement 6/7/8 scope is explicitly the current
// calendar day's Daily_Challenge; the exam is a separate, on-demand,
// non-persisted self-check).

import { useMemo, useState } from "react";
import { buildExam, formatLocalDate } from "../domain/challenge";
import { gradeAttempt } from "../domain/grading";
import type { Lesson, Question } from "../domain/types";
import { getFunFactsForSection } from "../data/funFacts";
import { ProgressBar } from "./ProgressBar";
import { FunFactCard } from "./FunFactCard";
import { FeedbackPanel } from "./FeedbackPanel";

export interface ExamViewProps {
  lesson: Lesson;
  onExit: () => void;
  now?: () => Date;
}

interface ExamAnswer {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
}

export function ExamView({ lesson, onExit, now = () => new Date() }: ExamViewProps) {
  const exam = useMemo(() => {
    const seed = `${formatLocalDate(now())}:${lesson.id}`;
    return buildExam(lesson, seed, 2);
  }, [lesson, now]);

  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(undefined);
  // Explicit completion flag: distinct from "all questions answered" so the
  // last question's feedback/fact-card/"See Results" button all get a chance
  // to render before the summary screen replaces them.
  const [finished, setFinished] = useState(false);

  const total = exam.questions.length;
  const currentQuestion: Question | undefined = exam.questions[cursor];
  const currentAnswer = currentQuestion
    ? answers.find((a) => a.questionId === currentQuestion.id)
    : undefined;

  function handleSubmit() {
    if (!currentQuestion || !selectedOptionId || currentAnswer) return;
    const result = gradeAttempt(currentQuestion, selectedOptionId);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selectedOptionId,
        isCorrect: result.isCorrect,
      },
    ]);
  }

  function handleNext() {
    if (cursor + 1 >= total) {
      setFinished(true);
      return;
    }
    setSelectedOptionId(undefined);
    setCursor((c) => Math.min(c + 1, total - 1));
  }

  if (total === 0) {
    return (
      <div className="page">
        <main className="app-shell">
          <p className="empty-state">This lesson doesn&apos;t have enough content for an exam yet.</p>
          <button type="button" className="secondary-button" onClick={onExit}>
            Back to Daily Challenge
          </button>
        </main>
      </div>
    );
  }

  if (finished) {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const percent = Math.round((correctCount / total) * 100);
    return (
      <div className="page">
        <main className="app-shell">
          <section className="exam-summary" data-testid="exam-summary">
            <p className="exam-summary-score">{percent}%</p>
            <p className="exam-summary-label">
              {correctCount} of {total} correct across every section
            </p>
            <button type="button" className="primary-button" onClick={onExit}>
              Back to Daily Challenge
            </button>
          </section>
        </main>
      </div>
    );
  }

  const fact = currentQuestion ? getFunFactsForSection(currentQuestion.sectionId)[0] : undefined;
  const gradeResult = currentAnswer
    ? gradeAttempt(currentQuestion!, currentAnswer.selectedOptionId)
    : undefined;

  return (
    <div className="page">
      <main className="app-shell">
        <header className="app-header">
          <h1 className="app-title">Final Exam</h1>
          <p className="app-subtitle">Covering every section of {lesson.title}</p>
        </header>

        <ProgressBar current={cursor + 1} total={total} />

        {currentQuestion && (
          <div className="question-card" data-testid="question-card">
            <fieldset disabled={Boolean(currentAnswer)}>
              <legend className="question-prompt">{currentQuestion.prompt}</legend>
              <div role="radiogroup" className="option-list">
                {currentQuestion.options.map((option) => {
                  const isSelected = currentAnswer
                    ? currentAnswer.selectedOptionId === option.id
                    : selectedOptionId === option.id;
                  return (
                    <label
                      key={option.id}
                      htmlFor={`exam-${currentQuestion.id}-${option.id}`}
                      className="option-label"
                      data-selected={isSelected}
                    >
                      <input
                        type="radio"
                        id={`exam-${currentQuestion.id}-${option.id}`}
                        name={`exam-question-${currentQuestion.id}`}
                        checked={isSelected}
                        disabled={Boolean(currentAnswer)}
                        onChange={() => setSelectedOptionId(option.id)}
                      />
                      {option.text}
                    </label>
                  );
                })}
              </div>
              {!currentAnswer && (
                <button
                  type="button"
                  className="submit-answer"
                  disabled={!selectedOptionId}
                  onClick={handleSubmit}
                >
                  Submit
                </button>
              )}
            </fieldset>

            {gradeResult && (
              <FeedbackPanel
                isCorrect={gradeResult.isCorrect}
                correctOptionText={
                  currentQuestion.options.find((o) => o.id === gradeResult.correctOptionId)
                    ?.text ?? ""
                }
                explanation={gradeResult.explanation}
                sourceQuote={gradeResult.sourceQuote}
              />
            )}

            {currentAnswer && fact && <FunFactCard fact={fact} />}

            {currentAnswer && (
              <div className="next-question-row">
                <button type="button" className="next-question" onClick={handleNext}>
                  {cursor + 1 < total ? "Next Question" : "See Results"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

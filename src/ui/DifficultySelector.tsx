// DifficultySelector: lets the student choose how much of a hint the
// "Did You Know?" fact card gives before they answer.
//
// Honesty note: Astra's questions are generated deterministically and fixed
// for the day (Requirement 3.5) -- difficulty does NOT reshuffle, hide, or
// alter question content, options, or scoring (that would contradict the
// pure/deterministic Scoring_Engine and Requirement 3.5's "same questions on
// reopen" guarantee). Instead, difficulty controls a real, visible behavior:
// how early the section's fun fact appears relative to answering --
// - Easy: fact card shown up front, as a hint before answering.
// - Normal: fact card appears only after answering (default).
// - Hard: no fact card at all -- pure recall.
// This is presentational pacing, not a claim about adaptive question
// difficulty.

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultySelectorProps {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}

const OPTIONS: Array<{ id: Difficulty; label: string }> = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  easy: "Shows the \u201cDid You Know?\u201d fact before you answer, as a hint.",
  normal: "Reveals the fact after you answer, alongside grading.",
  hard: "No fact card -- pure recall, no hints.",
};

export function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
  return (
    <>
      <div className="difficulty-selector" role="group" aria-label="Difficulty">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="difficulty-option"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="difficulty-note">{DIFFICULTY_DESCRIPTIONS[value]}</p>
    </>
  );
}

// DifficultySelector: Easy / Normal / Hard. Difficulty changes how
// questions are BUILT (see src/domain/challenge.ts), never how they're
// scored:
// - Easy: 3 options, "which topic is this from?" style, topic named, hints shown
// - Normal: 4 options, fill-in-the-blank with key terms from the whole lesson
// - Hard: 4 options, fill-in-the-blank on the most specific term, look-alike
//   wrong answers from the same topic, no hints

import type { Difficulty } from "../domain/types";

export type { Difficulty };

export interface DifficultySelectorProps {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}

const OPTIONS: Array<{ id: Difficulty; label: string }> = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  easy: "3 choices, the topic is named, and hints are shown before you answer.",
  normal: "4 choices. Fill in the missing key term from your lesson.",
  hard: "4 look-alike choices from the same topic. No hints, pure recall.",
};

export function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
  return (
    <div className="difficulty">
      <div className="segmented" role="group" aria-label="Difficulty">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`segmented-option segmented-option--${option.id}`}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="difficulty-note">{DIFFICULTY_DESCRIPTIONS[value]}</p>
    </div>
  );
}

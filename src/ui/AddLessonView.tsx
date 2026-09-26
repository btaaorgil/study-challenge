// AddLessonView: the first screen of Studyy and the "New lesson" screen.
// The learner pastes notes (or opens a .txt/.md file), Studyy splits them
// into one section per topic with the local sectionizer (no network, no
// LLM -- see src/domain/importLesson.ts), shows what it found, saves the
// Lesson, makes it active, and builds today's Daily Challenge from it.

import { useId, useState, type ChangeEvent } from "react";
import { sectionizeText } from "../domain/importLesson";
import { generateAndPersistDailyChallenge, formatLocalDate } from "../domain/challenge";
import type { StorageLayer } from "../storage/db";
import type { Difficulty, Lesson } from "../domain/types";

export interface AddLessonViewProps {
  storage: StorageLayer;
  onLessonImported: (lesson: Lesson) => void;
  /** First run shows the welcome hero and the sample-lesson shortcut. */
  firstRun?: boolean;
  /** Offered on first run for people without notes handy. */
  onUseSample?: () => void;
  /** Shown when there's already a lesson to go back to. */
  onCancel?: () => void;
  difficulty?: Difficulty;
  /** Delay (ms) between staged progress steps. Lower this in tests to keep them fast. */
  stageDelayMs?: number;
}

type Stage = "idle" | "analyzing" | "sectioning" | "building" | "done" | "error";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  analyzing: "Reading your notes\u2026",
  sectioning: "Finding the topics\u2026",
  building: "Writing your quizzes\u2026",
  done: "Lesson ready",
  error: "",
};

const STAGE_PROGRESS: Record<Stage, number> = {
  idle: 0,
  analyzing: 30,
  sectioning: 65,
  building: 90,
  done: 100,
  error: 0,
};

const MAX_FILE_BYTES = 500_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AddLessonView({
  storage,
  onLessonImported,
  firstRun = false,
  onUseSample,
  onCancel,
  difficulty = "normal",
  stageDelayMs = 450,
}: AddLessonViewProps) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [imported, setImported] = useState<Lesson | undefined>(undefined);
  const titleId = useId();
  const notesId = useId();
  const fileId = useId();

  const isProcessing = stage === "analyzing" || stage === "sectioning" || stage === "building";

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too big. Paste the part you want to study instead.");
      return;
    }
    // Read locally in the browser; nothing is uploaded anywhere.
    const content = await file.text();
    setText(content);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    setError(undefined);
  }

  async function handleProcess() {
    setError(undefined);
    setImported(undefined);

    setStage("analyzing");
    await wait(stageDelayMs);

    setStage("sectioning");
    const result = sectionizeText(text, { title });
    await wait(stageDelayMs);

    if (!result.ok) {
      setStage("error");
      setError(result.error);
      return;
    }

    setStage("building");
    await storage.putLesson(result.lesson);
    await storage.setActiveLessonId(result.lesson.id);
    // Build today's challenge from the new lesson right away.
    await generateAndPersistDailyChallenge(
      formatLocalDate(new Date()),
      result.lesson,
      storage,
      difficulty,
    );
    await wait(stageDelayMs);

    setStage("done");
    setImported(result.lesson);
  }

  if (stage === "done" && imported) {
    return (
      <main className="app-shell upload">
        <section className="preview-card" data-testid="lesson-preview" aria-labelledby="preview-heading">
          <p className="eyebrow">Lesson ready</p>
          <h1 id="preview-heading" className="hero-title">
            {imported.title}
          </h1>
          <p className="hero-meta" role="status">
            Found {imported.sections.length} {imported.sections.length === 1 ? "topic" : "topics"} in
            your notes
          </p>
          <ol className="preview-list">
            {imported.sections.map((section, i) => (
              <li key={section.id} className="preview-item" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="topic-index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="preview-title">{section.title}</span>
                <span className="preview-count">
                  {section.concepts.length} {section.concepts.length === 1 ? "point" : "points"}
                </span>
              </li>
            ))}
          </ol>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => onLessonImported(imported)}>
              Start studying
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell upload">
      <section className="upload-hero">
        {firstRun ? (
          <>
            <p className="eyebrow">Welcome to Studyy</p>
            <h1 className="hero-title hero-title--xl">
              Turn your notes into <span className="gradient-text">quizzes</span>.
            </h1>
            <p className="hero-lead">
              Paste a lesson. Studyy finds each topic it teaches, then quizzes you daily and whenever
              you want to test yourself. Everything stays on your device.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">New lesson</p>
            <h1 className="hero-title">Add a lesson</h1>
            <p className="hero-lead">
              Paste your notes or slides. Headings become topics; without headings, Studyy splits
              wherever the subject changes.
            </p>
          </>
        )}
      </section>

      <section className="upload-card" aria-label="Add your notes">
        <label htmlFor={titleId} className="field-label">
          Lesson title <span className="field-hint">(optional)</span>
        </label>
        <input
          id={titleId}
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Biology chapter 3"
          disabled={isProcessing}
          maxLength={100}
        />

        <div className="field-row">
          <label htmlFor={notesId} className="field-label">
            Your notes
          </label>
          <span className="file-picker">
            {/* Input first so `input:focus-visible + label` can show the focus ring. */}
            <input
              id={fileId}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="visually-hidden"
              onChange={handleFile}
              disabled={isProcessing}
            />
            <label htmlFor={fileId} className="file-button">
              Open .txt / .md file
            </label>
          </span>
        </div>
        <textarea
          id={notesId}
          className="importer-textarea"
          placeholder={
            "## Photosynthesis\nPlants turn light into chemical energy in their chloroplasts...\n\n## Cell respiration\nMitochondria release energy from glucose..."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isProcessing}
          aria-label="Lesson notes"
          aria-describedby={error ? `${notesId}-error` : undefined}
        />

        {error && (
          <p id={`${notesId}-error`} className="importer-error" role="alert">
            {error}
          </p>
        )}

        {isProcessing && (
          <div className="processing-panel" data-testid="processing-panel">
            <div className="processing-track">
              <div className="processing-fill" style={{ width: `${STAGE_PROGRESS[stage]}%` }} />
            </div>
            <p className="processing-stage" role="status">
              <span className="processing-spinner" aria-hidden="true" />
              {STAGE_LABELS[stage]}
            </p>
          </div>
        )}

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={handleProcess}
            disabled={isProcessing || text.trim().length === 0}
          >
            Turn into quizzes
          </button>
          {onCancel && (
            <button type="button" className="ghost-button" onClick={onCancel} disabled={isProcessing}>
              Cancel
            </button>
          )}
        </div>
      </section>

      {firstRun && onUseSample && (
        <p className="sample-link">
          No notes handy?{" "}
          <button type="button" className="link-button" onClick={onUseSample}>
            Try the sample lesson on web fundamentals
          </button>
        </p>
      )}
    </main>
  );
}

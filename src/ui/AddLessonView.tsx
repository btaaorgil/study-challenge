// AddLessonView: the "Add Lesson" tab. Lets a student paste notes/slides,
// runs the local sectionizeText heuristic (no network, no LLM -- see
// src/domain/importLesson.ts for why), saves the resulting Lesson to the
// Storage_Layer, marks it as the active lesson, and regenerates today's
// Daily_Challenge from it immediately.

import { useState } from "react";
import { sectionizeText } from "../domain/importLesson";
import { generateAndPersistDailyChallenge, formatLocalDate } from "../domain/challenge";
import type { StorageLayer } from "../storage/db";
import type { Lesson } from "../domain/types";

export interface AddLessonViewProps {
  storage: StorageLayer;
  onLessonImported: (lesson: Lesson) => void;
  /** Delay (ms) between staged progress steps. Lower this in tests to keep them fast. */
  stageDelayMs?: number;
}

type Stage = "idle" | "analyzing" | "sectioning" | "curating" | "done" | "error";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  analyzing: "Analyzing text\u2026",
  sectioning: "Generating sections\u2026",
  curating: "Curating trivia\u2026",
  done: "Done!",
  error: "",
};

const STAGE_PROGRESS: Record<Stage, number> = {
  idle: 0,
  analyzing: 30,
  sectioning: 65,
  curating: 90,
  done: 100,
  error: 0,
};

/** Small delay so the staged progress animation is perceptible rather than instant. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AddLessonView({
  storage,
  onLessonImported,
  stageDelayMs = 500,
}: AddLessonViewProps) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [importedTitle, setImportedTitle] = useState<string | undefined>(undefined);

  const isProcessing = stage === "analyzing" || stage === "sectioning" || stage === "curating";

  async function handleProcess() {
    setError(undefined);
    setImportedTitle(undefined);

    setStage("analyzing");
    await wait(stageDelayMs);

    setStage("sectioning");
    const result = sectionizeText(text);
    await wait(stageDelayMs);

    if (!result.ok) {
      setStage("error");
      setError(result.error);
      return;
    }

    setStage("curating");
    await wait(stageDelayMs);

    await storage.putLesson(result.lesson);
    await storage.setActiveLessonId(result.lesson.id);
    // Immediately regenerate today's challenge from the freshly imported
    // lesson, so the Daily Challenge tab reflects it right away rather than
    // waiting for the next calendar day.
    await generateAndPersistDailyChallenge(formatLocalDate(new Date()), result.lesson, storage);

    setStage("done");
    setImportedTitle(result.lesson.title);
    onLessonImported(result.lesson);
  }

  return (
    <div className="page">
      <main className="app-shell">
        <header className="app-header">
          <h1 className="app-title">Add Lesson</h1>
          <p className="app-subtitle">Paste your course notes or slides below</p>
        </header>

        <p className="importer-intro">
          Astra splits your notes into 4 sections locally on your device -- no account,
          no upload, no external service. Paste at least a few sentences for best results.
        </p>

        <textarea
          className="importer-textarea"
          placeholder="Paste your lesson notes or slide text here&hellip;"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isProcessing}
          aria-label="Lesson notes"
        />

        <div className="importer-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleProcess}
            disabled={isProcessing || text.trim().length === 0}
          >
            Process Lesson
          </button>
        </div>

        {error && <p className="importer-error">{error}</p>}

        {(isProcessing || stage === "done") && (
          <div className="processing-panel" data-testid="processing-panel">
            <div className="processing-track">
              <div className="processing-fill" style={{ width: `${STAGE_PROGRESS[stage]}%` }} />
            </div>
            <p className="processing-stage">
              {isProcessing && <span className="processing-spinner" aria-hidden="true" />}
              {stage === "done" ? "Lesson ready!" : STAGE_LABELS[stage]}
            </p>
          </div>
        )}

        {stage === "done" && importedTitle && (
          <p className="importer-success">
            &ldquo;{importedTitle}&rdquo; is now your active lesson -- today&apos;s Daily
            Challenge has been updated. Head to the Daily Challenge tab to try it.
          </p>
        )}
      </main>
    </div>
  );
}

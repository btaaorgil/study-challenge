import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { AddLessonView } from "./AddLessonView";
import { createStorageLayer } from "../storage/db";
import { formatLocalDate } from "../domain/challenge";

const TWO_TOPIC_NOTES = `## Photosynthesis
Photosynthesis is the process plants use to convert light energy into chemical energy. It occurs in chloroplasts. Chlorophyll absorbs light for this process.

## Cellular respiration
Cellular respiration is how cells break down glucose to release energy. It happens in mitochondria. ATP is the main energy currency produced.
`;

let dbCounter = 0;
function freshStorage() {
  dbCounter += 1;
  return createStorageLayer(new IDBFactory(), `add-lesson-view-${dbCounter}`);
}

describe("AddLessonView: paste notes, find topics, build quizzes", () => {
  it("shows the welcome hero and sample shortcut on first run", async () => {
    const user = userEvent.setup();
    const { storage } = freshStorage();
    const onUseSample = vi.fn();
    render(
      <AddLessonView storage={storage} onLessonImported={vi.fn()} firstRun onUseSample={onUseSample} stageDelayMs={0} />,
    );
    expect(screen.getByText(/welcome to studyy/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try the sample lesson/i }));
    expect(onUseSample).toHaveBeenCalledTimes(1);
  });

  it("disables the process button until text is entered", () => {
    const { storage } = freshStorage();
    render(<AddLessonView storage={storage} onLessonImported={vi.fn()} stageDelayMs={0} />);
    expect(screen.getByRole("button", { name: /turn into quizzes/i })).toBeDisabled();
  });

  it("finds one section per topic, saves the lesson, sets it active, builds today's challenge, then previews", async () => {
    const user = userEvent.setup();
    const { storage } = freshStorage();
    await storage.init();
    const onLessonImported = vi.fn();

    render(
      <AddLessonView storage={storage} onLessonImported={onLessonImported} difficulty="hard" stageDelayMs={0} />,
    );

    // Bulk change (paste-like) instead of typing character by character.
    fireEvent.change(screen.getByLabelText(/lesson notes/i), { target: { value: TWO_TOPIC_NOTES } });
    await user.type(screen.getByLabelText(/lesson title/i), "Biology");
    await user.click(screen.getByRole("button", { name: /turn into quizzes/i }));

    const preview = await screen.findByTestId("lesson-preview");
    expect(preview).toHaveTextContent("Found 2 topics");
    expect(preview).toHaveTextContent("Photosynthesis");
    expect(preview).toHaveTextContent("Cellular respiration");
    expect(onLessonImported).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /start studying/i }));
    expect(onLessonImported).toHaveBeenCalledTimes(1);

    const importedLesson = onLessonImported.mock.calls[0][0];
    expect(importedLesson.title).toBe("Biology");
    expect(importedLesson.sections).toHaveLength(2);
    await expect(storage.getLesson(importedLesson.id)).resolves.toEqual(importedLesson);
    await expect(storage.getActiveLessonId()).resolves.toBe(importedLesson.id);

    const today = await storage.getDailyChallenge(formatLocalDate(new Date()));
    expect(today?.lessonId).toBe(importedLesson.id);
    expect(today?.difficulty).toBe("hard");
  });

  it("shows an inline error and does not import when there isn't enough content", async () => {
    const user = userEvent.setup();
    const { storage } = freshStorage();
    await storage.init();
    const onLessonImported = vi.fn();

    render(<AddLessonView storage={storage} onLessonImported={onLessonImported} stageDelayMs={0} />);

    fireEvent.change(screen.getByLabelText(/lesson notes/i), { target: { value: "Too short." } });
    await user.click(screen.getByRole("button", { name: /turn into quizzes/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/not enough content/i);
    });
    expect(onLessonImported).not.toHaveBeenCalled();
  });

  it("loads notes from a local .txt file into the editor", async () => {
    const user = userEvent.setup();
    const { storage } = freshStorage();
    render(<AddLessonView storage={storage} onLessonImported={vi.fn()} stageDelayMs={0} />);

    const file = new File([TWO_TOPIC_NOTES], "biology-notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText(/open .txt/i), file);

    await waitFor(() => {
      expect(screen.getByLabelText(/lesson notes/i)).toHaveValue(TWO_TOPIC_NOTES);
    });
    expect(screen.getByLabelText(/lesson title/i)).toHaveValue("biology-notes");
  });
});

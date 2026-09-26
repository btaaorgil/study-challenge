import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { AddLessonView } from "./AddLessonView";
import { createStorageLayer } from "../storage/db";

const RICH_NOTES = `
Photosynthesis is the process plants use to convert light energy into chemical energy. It occurs in chloroplasts. Chlorophyll absorbs light for this process. Oxygen is released as a byproduct.

Cellular respiration is how cells break down glucose to release energy. It happens in mitochondria. ATP is the main energy currency produced. Carbon dioxide is released as a byproduct.

Mitosis is the process of cell division that produces two identical daughter cells. It is used for growth and repair. The cell cycle includes several phases. Chromosomes are copied before mitosis begins.

DNA is the molecule that carries genetic information. It is shaped like a double helix. Genes are segments of DNA that code for proteins. Mutations are changes in DNA sequence.
`;

let dbCounter = 0;
function freshStorage() {
  dbCounter += 1;
  return createStorageLayer(new IDBFactory(), `add-lesson-view-${dbCounter}`);
}

describe("AddLessonView: paste, process, and import a lesson", () => {
  it("disables Process Lesson until text is entered", () => {
    const { storage } = freshStorage();
    render(<AddLessonView storage={storage} onLessonImported={vi.fn()} stageDelayMs={0} />);
    expect(screen.getByRole("button", { name: /process lesson/i })).toBeDisabled();
  });

  it("runs the staged pipeline, saves the lesson, sets it active, and calls onLessonImported", async () => {
    const user = userEvent.setup();
    const { storage } = freshStorage();
    await storage.init();
    const onLessonImported = vi.fn();

    render(
      <AddLessonView storage={storage} onLessonImported={onLessonImported} stageDelayMs={0} />,
    );

    // fireEvent.change (a single bulk paste-like update) instead of
    // userEvent.type (which types character-by-character and is far too
    // slow for a multi-paragraph string) -- this still exercises the real
    // onChange handler, just without simulating individual keystrokes.
    fireEvent.change(screen.getByLabelText(/lesson notes/i), { target: { value: RICH_NOTES } });
    await user.click(screen.getByRole("button", { name: /process lesson/i }));

    await waitFor(() => {
      expect(onLessonImported).toHaveBeenCalledTimes(1);
    });

    const importedLesson = onLessonImported.mock.calls[0][0];
    expect(importedLesson.sections).toHaveLength(4);

    // Persisted and marked active.
    const stored = await storage.getLesson(importedLesson.id);
    expect(stored).toEqual(importedLesson);
    await expect(storage.getActiveLessonId()).resolves.toBe(importedLesson.id);

    expect(screen.getByText(/is now your active lesson/i)).toBeInTheDocument();
  });

  it("shows an inline error and does not import when there isn't enough content", async () => {
    const user = userEvent.setup();
    const { storage } = freshStorage();
    await storage.init();
    const onLessonImported = vi.fn();

    render(
      <AddLessonView storage={storage} onLessonImported={onLessonImported} stageDelayMs={0} />,
    );

    fireEvent.change(screen.getByLabelText(/lesson notes/i), { target: { value: "Too short." } });
    await user.click(screen.getByRole("button", { name: /process lesson/i }));

    await waitFor(() => {
      expect(screen.getByText(/not enough content/i)).toBeInTheDocument();
    });
    expect(onLessonImported).not.toHaveBeenCalled();
  });
});

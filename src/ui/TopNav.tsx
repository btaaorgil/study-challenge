// TopNav: sticky Studyy header. Brand (goes home), a lesson switcher when
// there's more than one lesson, and the "New lesson" action.

import { useId } from "react";
import type { Lesson } from "../domain/types";

export interface TopNavProps {
  lessons: Lesson[];
  activeLessonId?: string;
  onHome: () => void;
  onSelectLesson: (lessonId: string) => void;
  onNewLesson: () => void;
  /** Hide the lesson controls (e.g. on the first-run upload screen). */
  minimal?: boolean;
}

export function TopNav({
  lessons,
  activeLessonId,
  onHome,
  onSelectLesson,
  onNewLesson,
  minimal = false,
}: TopNavProps) {
  const selectId = useId();
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <button type="button" className="brand" onClick={onHome} aria-label="Studyy home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-name">Studyy</span>
        </button>
        {!minimal && (
          <nav className="nav-actions" aria-label="Lessons">
            {lessons.length > 1 && (
              <>
                <label htmlFor={selectId} className="visually-hidden">
                  Current lesson
                </label>
                <select
                  id={selectId}
                  className="lesson-select"
                  value={activeLessonId}
                  onChange={(e) => onSelectLesson(e.target.value)}
                >
                  {lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.title}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button type="button" className="secondary-button nav-new" onClick={onNewLesson}>
              + New lesson
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}

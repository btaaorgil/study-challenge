import { useCallback, useEffect, useState } from "react";
import { ChallengeView } from "./ui/ChallengeView";
import { AddLessonView } from "./ui/AddLessonView";
import { ExamView } from "./ui/ExamView";
import { LessonDashboard } from "./ui/LessonDashboard";
import { TopNav } from "./ui/TopNav";
import { storage as defaultStorage, getStorageStatus as defaultGetStatus } from "./storage/db";
import type { StorageLayer, StorageStatus } from "./storage/db";
import { resolveActiveLesson, validateLesson } from "./domain/lesson";
import { SAMPLE_LESSON } from "./data/sampleLesson";
import type { Difficulty, Lesson } from "./domain/types";

type Screen = "upload" | "home" | "daily" | "exam";

export interface AppProps {
  storage?: StorageLayer;
  getStorageStatus?: () => StorageStatus;
}

function App({ storage = defaultStorage, getStorageStatus = defaultGetStatus }: AppProps) {
  const [ready, setReady] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState<Lesson | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>("upload");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshLessons = useCallback(
    async (activeId: string | undefined) => {
      const stored = (await storage.listLessons()).filter((l) => validateLesson(l).valid);
      // The bundled sample only shows up in the switcher once you've chosen it.
      setLessons(stored.filter((l) => l.id !== SAMPLE_LESSON.id || l.id === activeId));
    },
    [storage],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      // Opens IndexedDB (or degrades gracefully) and seeds SAMPLE_LESSON (Req 2).
      await storage.init();
      const stored = await storage.listLessons();
      const activeId = await storage.getActiveLessonId();
      const savedDifficulty = await storage.getDifficulty();
      if (cancelled) return;
      if (savedDifficulty) setDifficulty(savedDifficulty);
      await refreshLessons(activeId);
      // No lesson chosen yet -> the upload screen IS the app's first page.
      if (activeId) {
        setLesson(resolveActiveLesson(stored, SAMPLE_LESSON, activeId));
        setScreen("home");
      } else {
        setScreen("upload");
      }
      setReady(true);
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [storage, refreshLessons]);

  const activate = useCallback(
    async (next: Lesson) => {
      await storage.setActiveLessonId(next.id);
      await refreshLessons(next.id);
      setLesson(next);
      setScreen("home");
      setRefreshKey((k) => k + 1);
    },
    [storage, refreshLessons],
  );

  const goHome = useCallback(() => {
    setScreen(lesson ? "home" : "upload");
    setRefreshKey((k) => k + 1);
  }, [lesson]);

  const changeDifficulty = useCallback(
    (next: Difficulty) => {
      setDifficulty(next);
      void storage.setDifficulty(next);
    },
    [storage],
  );

  if (!ready) {
    return (
      <main className="app-shell">
        <p className="loading-state" role="status">
          Loading&hellip;
        </p>
      </main>
    );
  }

  return (
    <>
      <TopNav
        lessons={lessons}
        activeLessonId={lesson?.id}
        minimal={!lesson}
        onHome={goHome}
        onNewLesson={() => setScreen("upload")}
        onSelectLesson={(id) => {
          const next = lessons.find((l) => l.id === id);
          if (next) void activate(next);
        }}
      />

      {screen === "upload" && (
        <AddLessonView
          storage={storage}
          firstRun={!lesson}
          difficulty={difficulty}
          onLessonImported={(imported) => void activate(imported)}
          onUseSample={() => void activate(SAMPLE_LESSON)}
          onCancel={lesson ? goHome : undefined}
        />
      )}

      {screen === "home" && lesson && (
        <LessonDashboard
          lesson={lesson}
          storage={storage}
          difficulty={difficulty}
          onDifficultyChange={changeDifficulty}
          onStartDaily={() => setScreen("daily")}
          onStartExam={() => setScreen("exam")}
          refreshKey={refreshKey}
        />
      )}

      {screen === "daily" && lesson && (
        <ChallengeView
          lesson={lesson}
          storage={storage}
          getStorageStatus={getStorageStatus}
          difficulty={difficulty}
          onExit={goHome}
          onStartExam={() => setScreen("exam")}
        />
      )}

      {screen === "exam" && lesson && (
        <ExamView lesson={lesson} storage={storage} difficulty={difficulty} onExit={goHome} />
      )}
    </>
  );
}

export default App;

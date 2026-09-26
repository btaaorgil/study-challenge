# Studyy

Turn your lesson notes into quizzes. Paste your notes (or open a `.txt`/`.md` file), and Studyy splits them into one section per topic they teach, then quizzes you with a 5-question Daily Challenge and an any-time "Test Yourself" exam, at Easy, Normal, or Hard. Everything runs in your browser and is saved locally in IndexedDB. No account, no backend, no API key.

Built with [Kiro](https://kiro.dev) for the Kiro University Challenge.

## Why I built this

I got hooked on daily puzzle games like Wordle and word scrambles: one short challenge a day that you actually look forward to. Studying usually feels like the opposite. You read a pile of material, or have an AI squeeze it into a summary, and it doesn't stick.

Studyy takes that daily-puzzle feeling and points it at your own lessons. You paste your notes, and it pulls out the important parts and quizzes you on them in a fun, low-pressure way: a quick daily set, and a "Test Yourself" exam whenever you feel ready. The fun facts and bits of history beside each question keep you engaged and make things easier to remember, because they give each fact something to connect to.

## Features

- **Upload-first:** the app opens on the lesson screen. Headings in your notes become topics; without headings, Studyy starts a new topic where the subject changes.
- **Real difficulty:** Easy (3 choices, topic named, hints), Normal (fill in the missing key term), Hard (look-alike choices from the same topic, no hints).
- **Test Yourself:** an exam over every topic whenever you want, with a per-topic breakdown and the topics to review.
- **Topic insights:** cited fun facts and history beside each question for the sample lesson; key terms and a recap from your own notes for uploaded lessons.
- **Study calendar:** month view tinted by daily score, exam days marked, streak tracking.
- **Honest scoring:** only your first answer per question counts; score is a pure, tested function.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # Vitest + fast-check property tests
npm run build    # type-check + production build
```

## How Kiro was used

See [`NOTES.md`](NOTES.md) for the per-lesson writeup. In short:

| Kiro feature | Where |
|---|---|
| Spec (requirements, design, tasks) | `.kiro/specs/daily-challenge/` |
| Steering | `.kiro/steering/` |
| Hook (tests on save) | `.kiro/hooks/test-on-save.json` |
| Property-based tests | `src/**/*.property.test.ts(x)`, `src/domain/difficulty.test.ts` |
| Power (design-system-scaffold) | `NOTES.md` Lesson 5, `src/index.css` |
| MCP (fetch server for cited facts) | `.kiro/settings/mcp.json`, `src/data/funFacts.ts` |
| Custom agent (quiz-auditor) | `.kiro/agents/quiz-auditor.json` |

## Project layout

```
src/
  domain/   pure logic: lesson import, question generation, grading, scoring
  storage/  the only IndexedDB access point, with in-memory fallback
  data/     bundled sample lesson and cited fun facts
  ui/       React components
```

## License

See [LICENSE](LICENSE).

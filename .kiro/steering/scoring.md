---
inclusion: always
---

# Scoring Conventions

- Scoring logic lives in pure functions: same input -> same output, no side effects, no hidden state.
- Score is always bounded to the 0-100% range. Clamp at both ends, never let it under/overflow.
- A wrong answer never increases the score. At best it holds steady (e.g. no penalty mode); it should typically decrease or leave score unchanged.
- No mutation of shared/global score state inside scoring functions. Return new values; let the caller apply them.
- Any streak/bonus multipliers must be deterministic and testable in isolation from UI or storage code.
- Unit test scoring functions directly (no DOM, no IndexedDB) since they're pure.

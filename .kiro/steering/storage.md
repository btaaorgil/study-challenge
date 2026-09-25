---
inclusion: always
---

# Storage Conventions

- All persistence goes through IndexedDB. No external database, no backend API for data storage.
- No authentication, no user accounts, no login flow. This app is local-only, single-user.
- No network calls to store or sync user data. Nothing leaves the device.
- Wrap IndexedDB access in a small data-access layer (e.g. `db.ts`) so components never call IndexedDB directly.
- Handle IndexedDB errors gracefully (quota exceeded, blocked, unsupported browser) with a visible fallback message.
- Schema/version changes go through `onupgradeneeded`; document version bumps in code comments.

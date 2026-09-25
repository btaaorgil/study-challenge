---
inclusion: always
---

# UI Conventions

- Mobile-first layout. Design for small screens, scale up with responsive breakpoints.
- Accessible by default: semantic HTML, proper labels on inputs, visible focus states, sufficient color contrast.
- Keyboard navigable: all interactive elements reachable and operable via keyboard, no mouse-only interactions.
- Keep components simple and readable. No unnecessary nesting or premature abstraction.
- Use system fonts / minimal external assets to keep load fast on mobile connections.
- Prefer CSS that degrades gracefully; avoid layout that breaks without JS.
- Note: full accessibility compliance (WCAG) needs manual testing with assistive tech, not just code review.

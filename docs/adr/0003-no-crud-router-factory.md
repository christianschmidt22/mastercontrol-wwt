# ADR-0003: No CRUD router factory — inline route handlers

**Status**: Accepted
**Date**: 2026-04-25

---

## Context

The Phase 1 implementation plan (step 5 in `shiny-beaming-tower.md`) called for
a `backend/src/lib/crud-router.ts` generic factory: a function accepting
`{ list, get, create, update, remove, schemas }` that would produce a standard
5-endpoint Express router with zod validation already wired in. The intent was
to keep individual route files thin by delegating the boilerplate to the
factory.

The integrated review (R-020, `docs/REVIEW.md`) flagged this as unjustified
indirection for Phase 1:

- **Eight route groups** are planned. Not all are plain CRUD — `agents.route.ts`
  has SSE streaming, thread management, and tool-audit endpoints that cannot
  fit the factory shape. `settings.route.ts` is a key/value store. Custom
  routes already outnumber factory candidates.
- **Legibility over brevity.** A route file that is 40–60 lines of explicit
  handlers is easier to read, diff, and debug than a factory call whose
  produced routes are invisible until runtime.
- **Zod validation** is already handled by a one-function middleware
  (`lib/validate.ts`); the factory's main value-add collapses to a small
  number of lines per route.
- **Maintenance cost of the abstraction** is positive only when the number of
  purely identical shapes is large. With eight route groups and at least three
  custom shapes, the factory would be used for at most five groups — not
  enough to justify its own interface, tests, and documentation.

---

## Decision

Do not write `crud-router.ts`. Each route file is an explicit Express router
with its own list/get/create/update/delete handlers. Schemas and models remain
the boundaries; the route file is the thin glue between them.

The SSE helper (`lib/sse.ts`) is retained — it encapsulates the header setup
and cleanup pattern that is genuinely identical across any future streaming
endpoint.

---

## Consequences

**More lines of code, more legibility**
Each route file is longer than a factory call but self-contained. A developer
reading `organizations.route.ts` sees exactly what HTTP methods exist, what
validation runs, and what model functions are called — no indirection to trace.

**No factory interface to maintain**
Changes to error shapes, response codes, or validation behaviour are made
directly in the affected route file. There is no shared path through the
factory that might silently affect unrelated routes.

**Slightly more copy-paste risk**
The four-line `try { ... } catch (err) { next(err) }` pattern repeats. Accepted
— the redacting error handler centralises the actual consequence of errors;
the try/catch wrapper is mechanical and easy to grep.

**Re-evaluate threshold**
If the route count exceeds 20 and the majority of new routes are identical in
shape (list/get/create/update/delete with no custom logic), revisit. The
factory idea is not wrong in principle — just premature at eight routes.

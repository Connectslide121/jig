---
name: backend-architecture
description: Design or change API/service boundaries, data consistency and background workflows without unnecessary infrastructure.
---

# Backend architecture

Use for service/API/data-flow design, cross-module changes, integrations and background jobs.
Start from existing architecture, actual constraints and the smallest change that meets them.
Do not impose microservices, repositories or a new framework on routine endpoint work.

- Trace the request or event across authentication, authorization, validation, business rules,
  persistence and external side effects. Place trust checks at the owning server boundary.
- Keep domain decisions separate from transport and persistence details where this reduces
  coupling; follow established project conventions and supported framework versions.
- Define failure semantics before adding retries: which operations are safe to retry, what is
  idempotent, where timeouts/cancellation apply and how partial completion is recovered.
- Use a database transaction for one atomic consistency boundary. For database-plus-message
  delivery, consider an outbox only when reliable delivery is actually required. Do not claim
  exactly-once behavior from a retry loop.
- Bound collection reads and background concurrency. Identify N+1 queries, missing indexes,
  unbounded payloads and memory-heavy buffering from the actual access path before optimizing.
- Keep caches correct: ownership, expiry, invalidation and tenant/user scope. Do not cache
  authorization decisions or private responses across principals inadvertently.
- Make schema and API changes compatible with deployed clients. Explain migration ordering,
  rollback constraints and data backfills. Keep secrets and PII out of normal logs.
- Add useful diagnostics at failure boundaries: correlation, durations, error categories and
  safe context. Verify business outcomes and failure recovery with focused integration tests.

When a pattern or framework behavior is uncertain, consult its official documentation for the
project's version. Pattern reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/

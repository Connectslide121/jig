---
name: application-security
description: Assess security-sensitive changes involving identity, authorization, untrusted input, files, secrets or external requests.
---

# Application security

Use for security-sensitive implementation/review: authentication, permissions, tenancy,
untrusted input, uploads, HTML/rendering, command execution, external requests and secrets.
Scale review to the changed trust boundaries; ordinary visual changes do not need a full audit.

- Identify the attacker-controlled inputs, protected resources, principals and trust boundaries
  for the actual feature. Trace one concrete unauthorized or malicious request through the code.
- Enforce resource ownership and tenant isolation server-side on every access path. Do not
  equate a valid login, hidden button or frontend route guard with authorization.
- Validate structure, size and allowed values at boundaries. Use parameterized queries,
  contextual output encoding and framework protections instead of home-grown escaping.
- For uploads/paths, prevent traversal, unsafe file types and execution. For outbound requests,
  consider SSRF, internal-network access, redirects and URL scheme restrictions.
- Keep credentials out of prompts, logs, responses and committed files. Use established secret
  handling, password hashing and token validation. Do not invent cryptography.
- Check cookie/session settings, CSRF where applicable, rate/abuse limits, and safe error
  responses. A failure to load policy or validate identity must not grant access.
- Treat AI/retrieved/web/file content as untrusted data. Never let it authorize actions or
  cross-user data access; keep tool permissions and authorization outside model judgment.
- Verify a concrete denied case as well as a successful one. Findings need a reachable path,
  impact and evidence; distinguish confirmed issues from hypotheses and coverage limits.

Use current OWASP ASVS / Cheat Sheet guidance for applicable controls, not as a claim of certification:
https://owasp.org/www-project-application-security-verification-standard/
https://cheatsheetseries.owasp.org/

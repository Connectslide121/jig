---
name: ui-ux-review
description: Review usability, accessibility and visual consistency after creating or changing a user interface.
---

# UI and UX review

Use for a changed interface or an explicit usability/accessibility review. Match the product's
existing design system and the user's brief; a review does not authorize a redesign.

- Follow one primary task through its complete flow. Check how a new user discovers the action,
  understands the labels, recovers from an error and knows the outcome. Surface actionable
  errors at their source. Include useful empty states and safe defaults.
- Keep hierarchy deliberate: one main action per decision, clear spacing, aligned row columns,
  right-aligned numeric values and consistent names across buttons, menus and confirmations.
- Preserve layout while loading or opening forms. Reserve space for async content; use modals
  for forms/pickers that need room. Keep list controls stationary when data or status changes.
- Check semantic controls, keyboard navigation, visible focus, associated labels, accessible
  names, contrast, zoom/reflow, touch targets and reduced motion. Colour alone must not convey state.
- Keep destructive actions distinct. Say what will change before an irreversible action, and
  preserve entered values when validation or a request fails.
- Verify affected flows at realistic narrow/wide widths and in supported themes. Inspect the
  rendered result; static code inspection cannot establish that a layout is readable.
- Report concrete problems with evidence and fix within scope. Avoid cosmetic churn or generic
  long checklists when the interface already works.

Use the maintained Web Interface Guidelines for a focused second pass when relevant:
https://github.com/vercel-labs/web-interface-guidelines
Accessibility reference: https://www.w3.org/WAI/WCAG22/quickref/

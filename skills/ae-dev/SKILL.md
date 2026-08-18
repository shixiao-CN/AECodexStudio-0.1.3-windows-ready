---
name: ae-dev
description: Build, inspect, automate, and troubleshoot Adobe After Effects projects using ExtendScript/JSX.
---

# AE Development

This bundled copy is a portable fallback. AE Codex Studio prefers the user's skill at
`%USERPROFILE%/.agents/skills/ae-dev/SKILL.md` when it exists.

## Required behavior

- Control After Effects through the structured actions exposed by the panel.
- Preserve the current project and existing work.
- Prefer stable match names such as `ADBE Transform Group`, `ADBE Position`, `ADBE Scale`, `ADBE Rotate Z`, and `ADBE Opacity`.
- Check the active composition and selected layers before creating actions.
- Use `set_property` only for properties without keyframes; use `set_keyframes` for animation.
- Use seconds for time and arrays of the correct dimensionality for 2D/3D properties.
- Apply Bezier easing with a sensible influence, normally 60–85.
- Mark precomposition and other structural operations as requiring confirmation.
- Never guess effect child-property indexes or emit arbitrary scripts.
- Use editable text and shape layers instead of flattened footage when possible.

## Reliability notes

- AE collections are one-based, while `selected:N` targets are zero-based by panel convention.
- Locked layers cannot be changed.
- Existing user work must remain recoverable through the single undo group created by the host bridge.

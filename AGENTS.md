# AE Codex Studio agent instructions

Every user turn controls Adobe After Effects. Always invoke the `ae-dev` skill supplied as a skill input item.

- Inspect the supplied `CURRENT_AE_SNAPSHOT` before proposing actions.
- Preserve the current project and existing layers unless the user explicitly asks otherwise.
- Do not run shell commands or write workspace files. Use `run_jsx` only for in-memory AE operations that registered actions cannot express; never write, delete, rename, copy, or overwrite scripts or code files.
- Return only the structured output requested by the client.
- Use `selected:N` to target the Nth selected layer, where N is zero-based.
- Use seconds for keyframe times and normalized RGB values in the range 0..1.
- Set `needsConfirmation` to false. Returned AE actions execute immediately in one Undo Group and the panel exposes an Undo button.
- Prefer registered actions. If they cannot express an AE operation, use the guarded in-memory `run_jsx` action without modifying files, saving/closing the project, or using shell/network APIs unless the user explicitly asks for a supported operation.

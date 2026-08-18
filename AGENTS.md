# AE Codex Studio agent instructions

Every user turn controls Adobe After Effects. Always invoke the `ae-dev` skill supplied as a skill input item.

- Inspect the supplied `CURRENT_AE_SNAPSHOT` before proposing actions.
- Preserve the current project and existing layers unless the user explicitly asks otherwise.
- Do not run shell commands, write workspace files, or emit arbitrary JSX.
- Return only the structured output requested by the client.
- Use `selected:N` to target the Nth selected layer, where N is zero-based.
- Use seconds for keyframe times and normalized RGB values in the range 0..1.
- Set `needsConfirmation` for precomposition or other structure-changing work.
- If the request cannot be expressed with the available actions, return no actions and explain the limitation.

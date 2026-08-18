# AE Codex Studio skills interface

Add one directory per skill:

```text
skills/
  my-skill/
    SKILL.md
    SKILL.json
    host/entry.jsxinc   # optional
```

`SKILL.json` example:

```json
{
  "name": "my-skill",
  "interface": {
    "displayName": "My AE Skill",
    "shortDescription": "Adds a focused AE workflow"
  },
  "dependencies": { "tools": [] },
  "aeCodex": {
    "autoInvoke": false,
    "hostEntry": "host/entry.jsxinc",
    "actionSchema": "actions.schema.json"
  }
}
```

- `autoInvoke: true` attaches the skill to every Codex turn.
- `hostEntry` is optional. When present, the panel loads it with `$.evalFile`.
- A host module registers structured operations with `AECodex.registerOperation(name, handler)`.
- Operation names must be unique. The core refuses to overwrite an existing operation.
- `actionSchema` may contain one action Schema object or an array of action Schemas. The panel merges them into the turn output Schema automatically.
- User skill roots (`%USERPROFILE%/.agents/skills` and `%USERPROFILE%/.codex/skills`) take precedence over bundled skills.

The panel always treats `ae-dev` as an automatic required skill, even when its manifest omits `autoInvoke`.

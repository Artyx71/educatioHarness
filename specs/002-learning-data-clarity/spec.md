# Learning data clarity and portable plans

Status: implemented locally; cross-platform verification remains open.

## User stories

1. A learner who already has a `.md` or `.txt` roadmap can start from it without repeating a diagnostic assessment. The dashboard exposes a visible «Загрузить план» action. The learner previews or edits the text before sending it to the selected real AI provider.
2. A learner deleting a chat knows whether only the session or the complete learning goal is removed. If no chats remain but the goal still has a plan, practice or graph, the dashboard explains that retained state and offers explicit full deletion.
3. A learner can export notes to an Obsidian vault without overwriting existing files. The export includes note links corresponding to stored graph relationships and keeps files of different goals distinct.

## Acceptance criteria

- Only user-selected `.md`/`.txt` files are read. Unsupported extensions, binary NULs, fewer than 20 or more than 60,000 characters, or files larger than 120 KB are rejected. The original file is never modified.
- Imported text is treated as untrusted learner data. The `curriculum-planner` preserves coverage/order where possible, validates unique topic IDs and acyclic existing prerequisites, and does not claim any diagnostic evidence or mastery.
- No goal is created if the model returns invalid plan structure. If local persistence fails after creating the new goal, the newly created goal is removed; existing goals are untouched. A failed cleanup produces an actionable error.
- Removing a session cascades its transcript and diagnostic answers, but leaves the goal, plan, practice and graph. Removing a goal cascades all of its dependent data. Both operations require a clear confirmation in the UI.
- Exported Markdown uses unique filenames across goals and `[[wikilinks]]` for topic/node and premise/conclusion relationships. It creates a new folder inside the chosen vault and does not edit existing notes.
- Russian UI counts use correct singular/few/many word forms.

## Verification

Automated TypeScript tests cover file validation, dependency validation, partial-save cleanup and Russian plural edge cases. Rust tests cover SQLite deletion cascades, multi-goal Obsidian filenames and graph links. A real Codex request confirmed imported topic preservation; Android emulator verified model-backed import, SQLite persistence and dashboard-to-import navigation. Native Android file picker, Windows/macOS and two-device archive transfer remain unverified.

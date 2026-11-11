# educatioHarness Constitution

## Core Principles

### I. Working learning journey
Every release must preserve the real user path: connect a supported AI provider, set a goal, answer a diagnostic, inspect and edit a prerequisite-aware curriculum, learn interactively, practise, inspect sourced knowledge claims, and resume after restart. A model response is never simulated as success. Incomplete or unverified paths are documented explicitly.

### II. Local-first ownership and portability
SQLite is the authoritative learning store. Schema changes use versioned migrations. Import/export must preserve user-created learning data, validate archives, keep a recoverable copy before replacement, and never silently merge conflicting devices. Credentials and device-specific AI sessions must not enter portable archives.

### III. Trusted boundaries
Frontend and imported skills are untrusted. Rust validates command inputs and owns persistence and secrets. Node/Codex run behind a constrained protocol. Dangerous operations require explicit user approval; model text cannot grant permissions. Official Codex login is the only ChatGPT authentication path, and OpenAI API keys are separate.

### IV. Pedagogy before decoration
The learning plugin retains LearnHarness-derived diagnostic, Socratic, proposition, reasoning-chain, extraction and audit semantics where feasible. Claims are not mastery scores or objective proof. Practice feedback distinguishes model judgment from deterministic verification. Visual polish must support the learning task, not replace it.

### V. Small generic core, explicit workflow plugin
The transport, workflow state, skills, provider selection and persistence interfaces remain domain-neutral. Learning-specific prompts and transitions live in the learning plugin. Avoid distributed infrastructure and abstractions without a current consumer.

### VI. Verifiable cross-platform delivery
Each feature spec defines observable acceptance scenarios, failure cases and evidence. Changes run relevant TypeScript, frontend, server and Rust tests; packaging and device behavior are claimed only where actually built or exercised. Linux is the development baseline, with Windows, macOS and mobile limitations reported honestly.

## Product and licensing constraints

- The UI is Russian, compact and dark by default, with keyboard-visible focus and usable narrow layouts.
- The upstream LearnHarness repository is reference material outside shipping artifacts. Adapted AGPL-3.0 material retains notices and attribution in `docs/upstream-reuse.md`.
- No hard-coded demonstration AI response, plaintext credential in SQLite, unauthenticated local network API, or arbitrary shell execution from UI/model content.
- Desktop supports ChatGPT through official Codex CLI state and OpenAI Responses through a separately stored API key. Mobile may use the user-controlled HTTPS server but must expose its privacy boundary.

## Spec-driven workflow

For each bounded product change, write or update a specification under `specs/` before implementation. Include user scenarios, functional requirements, edge cases and measurable acceptance checks. Record a plan and task list for multi-file work. Tests, build commands and manual checks must map back to the applicable requirements. Keep specs current when implementation changes; do not mark a task complete on the strength of a mock or an unrun CI job. Existing code predates this constitution and is not retroactively represented as spec-verified.

## Governance

This constitution guides repository work below user instructions. Amend it with a documented reason and version change. Review any exception against the user journey and security boundary; record unresolved gaps in the relevant spec and README. A release is complete only after its stated acceptance evidence exists.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11

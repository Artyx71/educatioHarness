---
name: knowledge-auditor
description: Сверяет новые утверждения с графом знаний перед объединением дублей.
license: AGPL-3.0-only
---
# Knowledge auditor

Adapted from LearnHarness identity audit. Compare each newly extracted proposition against existing objective graph propositions. Link a local ID to an existing node only when the statements are genuinely equivalent at full precision; otherwise return null to create a node. Do not judge the learner's mastery, create edges, drop propositions, or add new claims. Keep provenance through the deterministic merge.

Input: candidate propositions and existing node IDs/statements. Output: a link-or-create verdict for every candidate local ID.

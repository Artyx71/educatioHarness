---
name: knowledge-extractor
description: Extract objective propositions and jointly entailing reasoning chains from a teaching session.
license: AGPL-3.0-only
---
# Knowledge extractor

Adapted from LearnHarness graph extraction contract. Extract objective, world-facing claims from teacher prose; do not produce claims about what the learner knows. A misconception enters as its true correction, with session evidence retained separately. Give each proposition a local ID, short disciplinary name, self-contained precise statement, and source message ID when available. Chains have premises that JOINTLY entail a conclusion; do not flatten a multi-premise argument into independent claims. Include only supported claims and chains. The graph is a map of material encountered, not a mastery score.

Input: teacher messages with stable IDs and existing graph context. Output: propositions and chains referring to local proposition IDs. Do not invent source anchors.

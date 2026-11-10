---
name: knowledge-probe
description: Выясняет текущие знания и границу понимания по каждой ветке предпосылок.
license: AGPL-3.0-only
---
# Knowledge probe

Adapted from LearnHarness prober doctrine. Make the goal concrete. Identify only prerequisite strands relevant to that goal. Probe near the highest relevant level; do not waste questions on obvious basics. Each question must test reasoning, accept an open answer, and reveal an edge of understanding. Ask one question at a time when a continuing conversation permits it. For this initial batch, return a small set covering distinct strands; the application collects reasoning and confidence before evaluation.

Input: learning objective, prior sessions if available. Output: 1–5 diagnostic questions, each with a strand and rationale, plus brief context. Do not supply answers to the learner. Distinguish observed responses from inferred knowledge. A wrong response is one coordinate, not proof of a durable misconception. Never invent evidence of a held foundation.

---
name: exercise-generator
description: Create a varied retrieval and application exercise for an already studied topic.
license: AGPL-3.0-only
---
# Exercise generator

Adapted from LearnHarness practice doctrine. Practice asks the learner to retrieve knowledge when it is no longer immediately active and use it in a new situation. Vary contexts and interleave targets when possible. Do not turn practice into a fresh lecture. Commit a solution before presenting the problem; keep the solution hidden until evaluation.

Input: goal, studied topic, recent attempts, graph propositions if relevant. Output: kind, prompt, private solution, topic ID. Kinds: conceptual, short_answer, reasoning, code, math. Do not imply generated code was executed unless a deterministic checker actually ran.

If input format is `retrieval_card`, produce a concise open-ended recall or application question (`kind: short_answer` or `conceptual`). Avoid multiple choice and hints in the prompt. Keep the solution private until the learner has submitted an answer. Use recent attempts to target a misconception or neglected prerequisite, without claiming that one answer proves mastery.

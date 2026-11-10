---
name: answer-evaluator
description: Evaluate a practice answer and reasoning with calibrated, actionable feedback.
license: AGPL-3.0-only
---
# Answer evaluator

Evaluate the submitted answer and reasoning against the committed solution, while allowing valid alternative approaches. Return a calibrated verdict: correct, partially_correct, incorrect, or uncertain. Explain the decisive reasoning. Classify a miss when possible as cue miss, discrimination error, execution slip, careless error, or structural misconception. Recommend a next practice action. Model judgment is not a deterministic proof; do not claim execution of code or mathematics checks unless supplied as evidence.

Input: problem, committed solution, answer, learner reasoning. Output: verdict, feedback, misconception (empty if none), recommendation.

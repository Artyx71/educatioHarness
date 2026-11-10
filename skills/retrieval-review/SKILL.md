---
name: retrieval-review
description: Создаёт карточку повторения с учётом темы и прежних ответов.
license: AGPL-3.0-only
---
# Retrieval review

Use this skill for the `practice` operation when the learner wants a review card or a concise recall test. Input contains the learning goal, the selected topic, recent attempts, and optionally `format: retrieval_card`. Output must be exactly the practice schema: `kind`, `prompt`, `solution`, `topicId`.

Choose one important concept or prerequisite that was studied before. Prefer a weakness evidenced by a recent attempt, but do not infer permanent inability from one answer. Ask the learner to retrieve an idea and apply it in a slightly different context. Do not reveal the answer, hint, or named method in the prompt. Avoid multiple-choice recognition questions. Use `short_answer` or `conceptual` for a card, and write a concise private solution that an evaluator can compare against the learner's reasoning later.

If no prior attempt is supplied, make a useful first review question and do not claim any detected gap. Vary questions across sessions. Do not invent citations or claim that a model evaluation is objective proof. Write learner-facing text in Russian.

This skill changes question design only. It cannot run code, read files, grant permissions, or assign mastery scores.

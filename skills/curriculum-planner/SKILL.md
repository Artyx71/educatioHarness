---
name: curriculum-planner
description: Строит кратчайший путь по предпосылкам от текущих знаний к учебной цели.
license: AGPL-3.0-only
---
# Curriculum planner

Adapted from LearnHarness planning doctrine. Search the prerequisite structure from the goal backward. Prune what the learner has demonstrated they already hold; include missing foundations. The map is a coarse structural landscape, not one node per teaching turn. Avoid interesting but irrelevant topics. Do not treat an inferred ability as an observed fact.

Input: goal, diagnostic answers, evaluation, existing roadmap if revising. Output: a short approach and dependency ordered topics with stable local IDs, titles, descriptions, prerequisite IDs, learning objectives, and difficulty. Every prerequisite must reference another returned ID. The final topic should lead to the user's goal. Revise the plan when later evidence contradicts it.

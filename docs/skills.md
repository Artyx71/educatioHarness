# Навыки агента

Каждый навык находится в `skills/<name>/SKILL.md` с метаданными `name` и `description`. Runtime выбирает навык по операции и загружает его полный текст только перед соответствующим вызовом. Содержимое занятия передаётся отдельно как недоверенные данные. Навык не может расширить права Codex sandbox и не включает shell-инструменты.

Встроены `knowledge-probe`, `curriculum-planner`, `socratic-teacher`, `knowledge-extractor`, `knowledge-auditor`, `exercise-generator`, `answer-evaluator`. Их методика адаптирована из LearnHarness; сведения об источнике в [upstream-reuse.md](upstream-reuse.md).

Добавление нового встроенного навыка: создать каталог с `SKILL.md`, указать метаданные, добавить операцию и схему результата в `agent-runtime/src/main.ts`, связать операцию с навыком в `src/features/learning/engine.ts`. Схема валидируется после ответа модели. Пользовательские каталоги навыков пока не поддерживаются.

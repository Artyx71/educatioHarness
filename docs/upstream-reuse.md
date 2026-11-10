# LearnHarness: анализ и повторное использование

Исходный репозиторий: <https://github.com/amosblomqvist/learnharness>. Использованный коммит: `da08cb5f7d098598ba963c6689b22054c9f2a5a3`. Версия в `package.json`: 0.5.0, лицензия AGPL-3.0-only. Репозиторий клонирован в `.references/learnharness`, исключён из Git и сборки educatioHarness.

Прочитаны `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/development.md`, `docs/teaching-methodology.md`, `src/agent/prompts/README.md`; изучены `src/agent/teacher-agent.ts`, `src/agent/tools/`, `src/agent/subagents/extraction.ts`, `src/core/graph.ts`, `src/core/ports.ts` и `src/store/`. Его `skills/learnharness/SKILL.md` предназначен для чтения накопленных данных внешним агентом, а не содержит весь обучающий workflow.

Адаптированы методика и контракты: точная диагностика на границе понимания, минимальное дерево предпосылок, обучение одним шагом с проверкой, практика извлечения знания из памяти, объективные пропозиции и совместно достаточные посылки, отделение графа от оценки усвоения. Эти положения изложены заново в `skills/*/SKILL.md` и проверяются структурированными схемами runtime. Исходные промпты LearnHarness не копировались целиком: их tool contracts рассчитаны на Pi Agent и собственный реестр инструментов.

Визуальная структура адаптирована по `components/sidebar.tsx`, `components/minimal-home.tsx` и скриншотам `docs/assets/`: компактная колонка с учебными занятиями, отдельные действия обучения/практики, спокойный главный экран с одним полем цели. Код интерфейса написан заново для React/Vite/Tauri; все пользовательские подписи переведены на русский.

Переписаны интеграционные части: Next.js маршруты, Electron host, JSON/JSONL stores, Pi provider adapter, фоновые worker jobs и browser helper. educatioHarness использует Tauri commands, SQLite и официальный Codex SDK/OpenAI SDK. Прямой перенос был бы сильнее связан с Next/Electron и создал бы несовместимый процесс хранения. Граф хранит те же принципиальные сущности, но его merge пока проще: модель предлагает identity links, а код сохраняет узлы, цепочки и provenance. Нет исходных алгоритмов упрощения цепочек, clustering и покрытия токенов.

Атрибуция: LearnHarness © Amos Blomqvist и участники; [upstream LICENSE](https://github.com/amosblomqvist/learnharness/blob/da08cb5f7d098598ba963c6689b22054c9f2a5a3/LICENSE). educatioHarness распространяется по AGPL-3.0-only; исходные уведомления сохранены в документации и файле лицензии. При распространении производной работы необходимо выполнять условия AGPL-3.0.

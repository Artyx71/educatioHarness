# Разработка

Окружение: Node.js 22+, npm, Rust stable, Tauri 2, GTK 3, WebKitGTK 4.1, libsoup 3, Secret Service. На Arch Linux проверены Node 26.7.0, Rust 1.98.0, WebKitGTK 2.52.6.

```sh
npm install
npm run tauri dev
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

Перед `tauri dev` автоматически запускается `runtime:bundle`: esbuild собирает runtime и копирует исполняемый Node и официальный Codex CLI для текущего host triple в `src-tauri/binaries/`. Tauri помещает оба бинарника и модуль в ресурсы. На другой платформе сборку нужно выполнять на её архитектуре; копирование системного Node подходит только при совместимой версии и архитектуре. На Windows у sidecar должно быть расширение `.exe`. Платформенные настройки Tauri задают NSIS для Windows и app/dmg для macOS; Linux дополнительно собирает RPM командой `npm run desktop:build:rpm`. Три host-ОС проверяет GitHub Actions. Прямой запуск `node agent-runtime/dist/main.js` используется при разработке. В Hyprland приложение включает XWayland и программную отрисовку из-за ошибки WebKitGTK/GBM на проверенной системе.

В UI на первом запуске показано подключение. Для ChatGPT используется официальный комплектный Codex CLI (`codex login status`, `codex login`, `codex logout`), который разделяет штатное состояние входа с установленным CLI; для API-ключа — Secret Service, macOS Keychain или Windows Credential Manager. Приложение не читает файлы токенов Codex и не использует ChatGPT-сессию для прямого Responses API. Проверка подключения делает реальный запрос модели.

Тесты без оплачиваемых запросов проверяют миграции и контрактные условия. Отдельный реальный smoke-запрос выполнялся на установленной Codex-сессии; запуск тестов сам по себе не подтверждает доступность аккаунта другого пользователя.

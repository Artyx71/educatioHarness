# Tasks: Mobile learning and protected transfer

- [x] T001 [US1] Install Android SDK command-line tools, platform, build-tools, NDK and JDK under the user's home directory; verify tool versions.
- [x] T002 [US1] Generate the Android project with Tauri and compile the ARM64 Rust library.
- [x] T003 [US1] Produce an ARM64 debug APK and inspect its package/native libraries (build and `aapt` passed; installation still belongs to T004).
- [x] T004 [US1] Install x86_64 APK on Android API 36 emulator; complete real Codex-backed diagnostic, curriculum, Socratic lesson, practice evaluation and graph; reinstall APK and verify SQLite counts persist. Physical ARM64 device remains untested.
- [x] T005 [US2] Transfer a protected archive from desktop to Android. The Linux-host Rust backup path produced a synthetic schema-5 `.ehb` containing a goal, lesson, topic, exercise, attempt and graph provenance; a separate authenticated server relayed it to Android API 36, where the native import restored every record, retained local connection settings and created a recovery backup. A stale `If-Match` PUT returned 412 without changing the archive; the server integration test also covers two concurrent writers. Wrong password and missing accepted ETag were tested separately. The desktop GUI export and a physical-device transfer remain unverified.
- [x] T006 [US2] Inspect universal ARM64+x86_64 APK entries (only app native libraries, no desktop sidecar) and emulator SQLite preferences (model/provider/URL/ETag only; no credential keys); archive bytes checked for plaintext markers. Physical ARM64 install remains untested.
- [ ] T007 [US3] Build iOS app on macOS and repeat the learning/transfer journey. The unsigned simulator app built and launched in [CI run 43019775254](https://github.com/Artyx71/educatioHarness/actions/runs/43019775254); real server-backed learning and transfer on iOS remain unverified.
- [x] T008 Update README/development docs with exact verified commands, Android picker/roundtrip results and remaining limitations.
- [x] T009 Verify mobile server connection rejects archive-only endpoint and succeeds only after a real Codex-backed `validate` response.

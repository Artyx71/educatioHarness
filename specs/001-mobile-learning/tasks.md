# Tasks: Mobile learning and protected transfer

- [x] T001 [US1] Install Android SDK command-line tools, platform, build-tools, NDK and JDK under the user's home directory; verify tool versions.
- [x] T002 [US1] Generate the Android project with Tauri and compile the ARM64 Rust library.
- [x] T003 [US1] Produce an ARM64 debug APK and inspect its package/native libraries (build and `aapt` passed; installation still belongs to T004).
- [x] T004 [US1] Install x86_64 APK on Android API 36 emulator; complete real Codex-backed diagnostic, curriculum, Socratic lesson, practice evaluation and graph; reinstall APK and verify SQLite counts persist. Physical ARM64 device remains untested.
- [ ] T005 [US2] Transfer a protected archive from desktop to Android. Android emulator upload/import roundtrip, wrong password, missing ETag refusal, backup copy and absence of plaintext in server archive passed; distinct desktop-to-Android transfer and concurrent stale-ETag race remain to verify.
- [ ] T006 [US2] Confirm mobile package/SQLite contains no desktop sidecar or plaintext secret.
- [ ] T007 [US3] Build iOS app on macOS and repeat the learning/transfer journey.
- [ ] T008 Update README/development docs with exact verified commands, results and remaining limitations.

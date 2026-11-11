# Implementation plan: Mobile learning and protected transfer

1. Build the Android target on the Linux development host with the official SDK, NDK and a compatible JDK. Keep generated Gradle files out of Git; capture reproducible setup and package checks.
2. Verify the existing `cfg(mobile)` Rust commands and frontend branches against FR-002–FR-007. Fix build/runtime failures before expanding functionality.
3. Exercise the APK on a device or emulator using a real configured server and test fixture. Capture persistence and negative transfer cases as evidence in this spec.
4. Build and exercise iOS separately on macOS. Do not infer iOS success from Android compilation.

**Architecture**: Tauri WebView → validated Rust commands → local SQLite; mobile agent operations go to the user's authenticated HTTPS server. The protected archive moves only ciphertext. No Node/Codex executable is packaged on mobile.

**Safety**: Import validates and stages before replacement; upload uses the accepted server ETag. Device credentials stay outside portable learning data. Preserve a pre-import recovery copy.

**Verification gates**: `npm test`, `npm run build`, Rust mobile target check, Android APK build, APK/package inspection, then device/emulator journey. Record exact results rather than treating build success as runtime success.

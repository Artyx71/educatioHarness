# Feature Specification: Mobile learning and protected transfer

**Feature Branch**: `001-mobile-learning` (spec identifier; implementation may remain on `master`)

**Created**: 2026-11-11

**Status**: In progress; Android learning journey and synthetic Linux-host-to-emulator archive transfer verified; physical-device transfer and iOS parity pending

**Input**: The user wants educatioHarness installed on phones and able to continue the same learning journey after transfer from a computer.

## User Scenarios & Testing

### User Story 1 — Learn on Android (Priority: P1)

A learner installs the Android app, connects a trusted personal server, enters a learning goal, completes the diagnostic and lesson, closes the app and resumes the same local session later.

**Why this priority**: A mobile build without the real learning path is not a working mobile MVP.

**Independent Test**: Install an APK on an Android device or emulator, point it at a configured test server with a real model, complete one goal-to-practice journey, force-stop and reopen, and confirm the same data is present.

**Acceptance Scenarios**:

1. Given a fresh install and a reachable server, when the learner connects and validates it, then the app shows an explicit connected state and can make a real learning request.
2. Given a completed diagnostic, when the app restarts, then goal, questions, answers and curriculum remain visible.
3. Given no server or a failed AI request, when the learner retries, then the app shows an actionable error and does not invent an answer or lose their submitted text.

### User Story 2 — Move learning data to a phone (Priority: P2)

A learner sends a password-protected copy from a desktop to their own HTTPS server and restores it on Android without handing the archive password to the server.

**Independent Test**: Create data on desktop, upload a `.ehb`, restore it on Android, compare goal/session/attempt counts and provenance, then verify an incorrect password leaves local data intact.

**Acceptance Scenarios**:

1. Given a valid archive on the server, when the learner confirms import and enters its password, then the app validates it, creates a local recovery copy, replaces learning data and remembers the accepted server version.
2. Given a wrong password, corrupt archive or stale version, when import/upload is attempted, then local data and the remote archive remain unchanged and the error is visible.
3. Given an imported archive, when the app reopens, then learning history remains available and no desktop API key or provider session has been copied to the phone.

### User Story 3 — iPhone parity (Priority: P3)

An iPhone learner follows the same server-backed learning and restore path, with equivalent privacy and recovery behavior.

**Independent Test**: Build an iOS app on macOS, install it on simulator or device, and repeat the P1/P2 scenarios.

**Acceptance Scenarios**:

1. Given a working iOS build, when the learner signs into their server and restores an archive, then the same learning data and graph are available after restart.

### Edge Cases

- The server token is currently kept only in process memory; after restart the user must reconnect. It must never be silently stored in SQLite.
- After restart, stored lessons and the graph must remain available through an explicit offline choice even before the server token is re-entered. New AI requests still require reconnection.
- Android/iOS file pickers return URI forms the current Rust file importer does not support; the phone transfer UI must not offer a broken direct-file flow.
- Import while an agent request is running must be rejected.
- Two devices editing the same baseline must not silently overwrite one another; no automatic merge is promised.
- A server AI endpoint can see learning text. The UI must not describe this as end-to-end encrypted learning requests.

## Requirements

### Functional Requirements

- **FR-001**: Android MUST produce an installable APK for at least ARM64 without a desktop Node/Codex sidecar.
- **FR-002**: The mobile app MUST store learning sessions, curriculum, attempts and graph locally across restarts.
- **FR-003**: Mobile AI MUST use an explicitly configured HTTPS server and a real provider; unsupported local provider modes MUST not appear usable.
- **FR-004**: Mobile import MUST validate the password, archive integrity and schema before replacing data, and MUST keep a recoverable pre-import copy.
- **FR-005**: Server upload MUST reject a stale or unaccepted archive version; merely downloading a file MUST NOT establish a new upload baseline.
- **FR-006**: Neither archive passwords nor provider credentials MUST be stored in plaintext SQLite or sent to the archive endpoint.
- **FR-007**: Errors, loading states and reconnection requirements MUST be visible in Russian.
- **FR-008**: iOS MUST meet FR-002 through FR-007 before claiming mobile parity.

### Key Entities

- **Learning database**: goals, sessions, answers, curriculum, practice attempts, graph and workflow state.
- **Protected archive**: encrypted snapshot of learning data with a user-supplied password.
- **Server baseline**: the last remote version incorporated into this device's learning database.
- **Server connection**: address plus device-local access token; distinct from the archive password and AI credentials.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An ARM64 Android APK is produced and its package can be inspected or installed without a missing native library.
- **SC-002**: A tester completes one real goal → diagnostic → plan → lesson → practice journey on Android, restarts, and recovers the same session.
- **SC-003**: A desktop-to-Android transfer preserves all learning records in a test fixture; wrong-password and stale-version attempts preserve the original state.
- **SC-004**: No test or package inspection finds a desktop sidecar or plaintext secret in the mobile archive or app database.
- **SC-005**: iOS parity is claimed only after an iOS build and equivalent run; until then it remains an explicit limitation.

## Assumptions

- A personal trusted server with its own configured AI provider is available for live mobile AI requests.
- The first Android distribution can be a local test APK; public distribution signing is a separate release requirement.
- The app does not auto-merge learning edits from multiple devices.

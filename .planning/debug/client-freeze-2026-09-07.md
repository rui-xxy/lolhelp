# Client stopped / appeared frozen — 2026-09-07

## Status

Root cause found. Diagnostic only; no business source files changed.

## Symptoms

- Expected: the Electron client started after the 2026-09-06 performance refactor remains available and responsive.
- Actual: user reports that it "卡掉了" on 2026-09-07.
- Exact foreground action and exact user-observed time are not yet known.

## Root cause

The running client was the development instance launched by Codex through `npm start`, and its owning Codex PTY/session was reclaimed after about 10 hours 25 minutes. The Electron/Vite process tree therefore stopped with the terminal session. This incident is not recorded as a renderer OOM or renderer crash.

## Direct evidence

1. The Codex rollout record for process/session `74508` shows:
   - command: `npm start`
   - started: 2026-09-06 11:00:17.832 +08:00
   - completed: 2026-09-06 21:25:17.746 +08:00
   - duration: 37,499.913 seconds (10:24:59.913)
   - status: `failed`
   - exit code: `-1`
   - stderr: empty
   - stdout ends with ordinary app/network messages, not an Electron/V8 fatal error.
2. The saved-match archive's atomic replacement occurred at 2026-09-06 21:25:02.722 +08:00, only about 15 seconds before the PTY completed. This shows the main process and one-minute follow watcher were still doing normal work immediately before termination.
3. `%APPDATA%\LOL助手\logs\renderer-exits.jsonl` was last modified at 2026-09-06 03:05:14 +08:00. Its newest entry is the old pre-fix OOM at 2026-09-06 03:05:14 local; there is no renderer-exit record for the 21:25 stop.
4. Windows Application events from 2026-09-06 11:00 onward contain no `electron`, `LOL助手`, or `lolhelp` Application Error / Application Hang event. The only nearby WER event is an unrelated Microsoft Edge installer report at 21:15.
5. Current state on 2026-09-07: no `electron.exe` or `LOL助手.exe` process is running, and no process is listening on port 5173. Re-polling Codex process/session `74508` returns `Unknown process id 74508`.

## Ruled out for this stop

- Renderer OOM: no new `render-process-gone` log entry.
- Renderer native crash: no new renderer log entry and no relevant Windows crash event.
- Whole-system reboot/sleep at the stop time: no matching System event in the 21:15–21:35 window.
- The saved-match write hanging the main process: a normal archive write completed 15 seconds before the parent command was externally ended.

## Evidence boundary

The logs prove that the development launch session ended externally with exit code `-1` and no app crash signature. They do not identify which internal Codex lifecycle policy reclaimed the PTY, so the exact platform policy is inferred from the exact long fixed-duration termination and session ownership. If the user instead means an in-window freeze that happened before they manually closed/killed it, reproduction details and a fresh runtime trace are still needed.

## Recommended next action

Run the packaged `out\LOL助手-win32-x64\LOL助手.exe` (or launch it as a detached Windows process) for user testing. Do not rely on a long-lived `npm start` PTY as the persistent client. Add main-process lifecycle logging later if a packaged instance ever stops unexpectedly.

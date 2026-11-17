# GitHub Copilot Agent — Execute Exactly One Backlog Task

## Objective

Implement and validate exactly one task from `specs/implementation/backlog.md` in this session. The repository's backlog and execution log are the durable record of progress.

**Do not implement multiple tasks. Do not automatically move on to the next task.**

## Required startup procedure

1. Read repository `AGENTS.md` and any applicable nested `AGENTS.md`.
2. Read `specs/implementation/README.md`, `specs/implementation/backlog.md`, and the most recent relevant entry in `specs/implementation/execution-log.md`.
3. Inspect `git status`, current branch, and recent relevant changes. Preserve all user changes; do not reset, clean, stash, or overwrite them.
4. Check whether there is already a task marked `In Progress` or `Implemented — Validation Pending`.
   - If so, resume that task. Do not select another.
   - Inspect the working tree and previous handoff before continuing.
5. If no task is active, select exactly one `Ready` task:
   - Choose highest priority first: P0, then P1, then P2.
   - All dependencies must be `Verified`.
   - Use the explicit ordering in the backlog to break ties.
6. If the user has explicitly named a task ID, work only on that task and confirm it is eligible.
7. If no eligible task exists, explain why and stop. Do not invent a task or expand scope.

## Before implementation

For the selected task:

1. Read its full backlog entry, including scope, exclusions, acceptance criteria, dependencies, and validation plan.
2. Read only the relevant functional requirements, architecture documents, and wireframes.
3. Inspect the actual source and tests that implement the affected behaviour.
4. Verify that the task remains valid against the current code. If already complete, conflicting, duplicated, or no longer needed, explain the evidence and update the backlog appropriately without making unnecessary changes.
5. Provide a brief plan listing:
   - Expected files/modules to inspect or change.
   - Implementation approach.
   - Tests and validation to run.
   - Risks and out-of-scope items.
6. Change the task from `Ready` to `In Progress` in the backlog before editing code.

## Implementation rules

- Implement only the selected task and its acceptance criteria.
- Keep the change as small and cohesive as possible.
- Preserve current working Whisper and Groq integrations.
- Do not perform unrelated cleanup or refactoring.
- Do not change functional requirements or wireframes silently.
- Do not add dependencies without a demonstrated need.
- Follow the established web/native boundary and bridge contract.
- Keep audio in the native layer; do not move large audio buffers through the WebView bridge.
- Keep Groq credentials out of JavaScript storage and logs.
- Never introduce silent cloud fallback from Offline to Online.
- Add or update tests for the changed behaviour.
- Update architecture or wireframe documentation only when this task actually changes the documented design.

## Test and validation procedure

1. Run the most focused relevant tests first.
2. Run relevant regression tests.
3. Run build/lint checks when applicable.
4. Perform Android device validation when required by the task.
5. Record exact commands/procedures and actual outcomes.
6. Do not claim a check passed if it was not executed.
7. Preserve complete failure output and investigate failures introduced by the change.
8. Do not expand the task to fix unrelated failures. Record them separately.

### Decide the ending status

- Set `Verified` only when every acceptance criterion and every required validation check has passed.
- Set `Implemented — Validation Pending` when the code is complete but required tests/device checks remain incomplete or unavailable.
- Keep `In Progress` when implementation or required fixes remain underway.
- Set `Blocked` only when progress requires an external dependency, environment, or decision. Explain precisely what is blocking it.
- Never mark a task Verified merely because the application builds.

## Required end-of-session updates

Before finishing:

1. Update the selected task in `specs/implementation/backlog.md`:
   - Status and reason.
   - Files changed.
   - Acceptance-criteria checkboxes.
   - Tests and commands actually run.
   - Device validation results.
   - Remaining risks/issues.
   - Follow-up task IDs if identified.
2. Append a dated entry to `specs/implementation/execution-log.md`.
3. Ensure only one task is `In Progress`.
4. Do not mark or start the next task.
5. Check the final diff and report all modified files.

If the current task reveals additional work, create a new `Backlog` entry with a new stable ID, source references, dependencies, scope, acceptance criteria, and validation plan. Do not implement it in this session.

## Final response

Report:

- Task ID and title.
- What changed.
- Files modified.
- Acceptance criteria met and not met.
- Tests/build/device validation actually performed and results.
- Final task status and reason.
- Remaining issues or blockers.
- Next eligible task ID, if one exists.

Then stop. The next Copilot session will pick up from the repository state.

# Copilot Repository Instructions

Follow `AGENTS.md` for repository architecture, implementation workflow, and
task-selection rules. The guidance below supplements those instructions.

## Android build and device validation

### Preflight the environment

- Check the working tree, available Android SDK/native build tools, emulator
  status, device serial, and supported ABIs before building or deploying.
- Discover Waydroid's current IP rather than hardcoding a previous address.
  Target every device command at the verified serial.
- Check whether the application and proposed validation package IDs are already
  installed before deploying anything.

### Validate in layers

- Run focused unit tests first, then app-scoped instrumentation and relevant
  regression checks. Build the APK when required by the change.
- Prefer `:app:assembleDebugAndroidTest` over root-level
  `assembleDebugAndroidTest`: the latter also builds dependency modules' tests.
- Inspect test reports to distinguish actual execution, cached results, skipped
  tests, and failures. Re-execute when needed to establish fresh evidence.
- Check instrumentation results, not just the adb exit code: adb can exit
  successfully even when a test fails.

### Diagnose quiet native builds

- Unchanged Gradle output alone does not establish a hang. Inspect active
  Ninja/compiler/shader-generator processes, CPU activity, child processes, and
  output timestamps before deciding whether work is progressing.
- Use bounded waits and retain complete build output. Stop confirmed blocked
  work rather than repeatedly polling or launching duplicate builds.
- Verify native host-tool paths, especially cached paths pointing into older
  sessions. When necessary, use the existing `dictationHostC`,
  `dictationHostCxx`, `dictationGlslc`, and `dictationVulkanHeaders` Gradle
  properties with verified installed tools.
- Do not disable Vulkan, change CPU fallback, or patch vendor code merely to
  obtain a successful build. Distinguish a successful environment workaround
  from a proven root cause.

### Protect existing application data

- Use a separate validation application ID and disposable app-private fixtures
  for destructive tests. Never corrupt the user's installed model or overwrite
  their application/data.
- Verify APK application IDs and instrumentation targets before installation.
  Do not overwrite an existing validation package unless it is known to have
  been created for the current task.
- Verify downloaded fixture size and SHA-256. Keep model binaries out of the
  repository.
- Prefer test-APK assets when shell-based private-file provisioning is
  unavailable. Do not require root access or container security changes merely
  to stage fixtures.

### Exercise the real boundary and recovery

- Helper tests alone do not prove plugin/JNI behavior. Exercise success,
  failure, and restoration through actual production entry points.
- Include cached-state cases when relevant. For example, DIC-003 must reject a
  same-size corrupted model even after native inference has cached a valid
  model.
- Capture the actual inference backend and observable results rather than
  assuming Vulkan or CPU was used.
- Synthetic silence can verify inference execution and result shape, but not
  speech-recognition accuracy. Waydroid validation does not establish physical
  ARM behavior, microphone operation, or CPU fallback unless those paths were
  explicitly exercised on an appropriate target.

### Separate unrelated failures

- Preserve complete failure output and record concrete follow-up work for
  unrelated failures rather than expanding the current implementation task.
- If temporary test isolation is necessary, keep it outside committed build
  configuration and document exactly which sources or dependencies were
  excluded or overridden.
- Never describe an isolated test pass as a full-suite pass. Session-only
  exclusions and dependency alignment are validation aids, not permanent fixes.

### Finish cleanly

- Restore normal application APK output after isolated builds.
- Remove only validation packages and temporary files created by the task.
  Preserve the user's application/data and retain relevant evidence logs.
- Record exact commands, test counts, device/backend details, exclusions, and
  remaining checks in the execution log before updating task status.
- Mark a task Verified only after its required checks pass. Otherwise retain
  the appropriate incomplete status and identify the remaining validation.

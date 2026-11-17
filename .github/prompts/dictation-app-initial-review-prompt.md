# GitHub Copilot Agent — Initial Review: Existing Dictation App vs. New Requirements, Architecture, and Wireframes

## Role

Act as a senior application architect, Android engineer, and product-focused code reviewer. Your task is to understand the existing Dictation application, review the newly added product specifications, and produce an evidence-based enhancement plan.

**This is a review and planning task only. Do not implement the enhancements yet.**

## Product context

The application is a hybrid dictation app with:

- A web-based user interface.
- Native Android audio/transcription capabilities.
- **Offline (Whisper):** audio is transcribed locally using the existing native Whisper runtime and a locally stored model. Once the model is installed, offline transcription must work without internet connectivity or a Groq API key.
- **Online (Groq):** audio is sent directly from the Android device to the Groq transcription API. The user configures a Groq API key.
- Shared dictation, recording, transcript, settings, and Activity Trail experiences across both modes.

Do not assume a particular frontend framework, Android container, bridge technology, or native runtime implementation. Verify those details from the repository.

## Specification locations

The repository has the following specification areas:

- `specs/architecture/` — target architecture, component/sequence diagrams, deployment and security guidance, implementation plan, and native bridge contract.
- `specs/visualwireframes/` — UI wireframes, screen layouts, visual guidance, and interaction/state references.
- Newly added functional requirements — **discover these under `specs/` and any clearly referenced specification directory**. Do not assume their exact folder or filename. Identify the relevant documents by inspecting the repository and reading their contents.

Also read the repository-level `AGENTS.md` and any more specific `AGENTS.md` files that apply to directories being reviewed. Follow their instructions, including the OpenWiki just-in-time retrieval policy. Do not preload or search OpenWiki unless the conditions in `AGENTS.md` apply.

## Review objectives

Produce a clear answer to these questions:

1. What does the application actually do today?
2. How is the current application structured, including the web/native boundary?
3. Which newly documented functional requirements are already implemented, partially implemented, missing, unclear, or in conflict with the current design?
4. How closely does the current UI match the wireframes?
5. How closely does the current architecture match the target architecture?
6. What are the main technical, UX, security, reliability, and testing gaps?
7. What should be implemented first, and in what sequence, to enhance the application safely?

## Required workflow

### Stage 0 — Establish repository context and protect the working tree

1. Read `AGENTS.md` and applicable nested agent instructions.
2. Inspect the repository status and current branch before doing anything else.
3. Do not reset, clean, stash, overwrite, or otherwise disturb existing user changes.
4. Identify the application entry points, build system, test commands, and major source directories.
5. Record the review date and the commit/branch reviewed, where available.

Do not modify source files, configuration, dependencies, existing documentation, generated OpenWiki content, or user changes.

### Stage 1 — Review the current implementation first

Inspect the codebase before using the specifications to form conclusions. Establish an evidence-based baseline of the implementation as it exists today.

Inspect at least the relevant areas below, where present:

#### Web application
- Frontend framework and build process.
- Main dictation screen and reusable UI components.
- Settings and API-key configuration screens/dialogs.
- Application state management.
- Transcript rendering, timestamps, Copy/Share/Clear behaviour.
- Activity Trail implementation.
- Error, loading, empty, and readiness states.
- Responsive/mobile layout and accessibility behaviour.

#### Android/native application
- Android packaging/container approach: Capacitor, custom WebView, or another mechanism.
- Web-to-native bridge implementation and event lifecycle.
- Microphone permissions and audio capture.
- Recording start, pause, resume, stop, and cancellation.
- Whisper runtime integration and model-loading lifecycle.
- Model download, storage, validation, and recovery.
- Vulkan initialization and CPU fallback.
- Groq API integration, request format, timeout, and error handling.
- API-key storage and retrieval.
- Local persistence for settings, sessions, transcripts, and activity.
- Android lifecycle/background recording behaviour, if supported.

#### Quality and delivery
- Existing tests and their coverage.
- Build, lint, and test commands.
- Existing CI/release packaging.
- Runtime logs or known issues documented in the repository.

For each important finding, provide evidence such as file paths, class/function/component names, and line references where available. Do not infer that a feature works merely because a class or UI control exists; trace the actual call path and tests where practical.

Run existing, non-destructive checks when reasonable. Do not install or upgrade dependencies, alter generated files, or make source changes just to get a test running. Record commands and outcomes accurately. If device-only behaviour cannot be verified in the current environment, mark it as requiring device validation.

### Stage 2 — Read the new functional requirements

1. Discover all relevant functional-requirement documents under `specs/` and any directly referenced requirements location.
2. Identify document titles, versions/dates, and apparent precedence where explicitly stated.
3. Read the complete relevant documents, not just filenames or summaries.
4. Extract each distinct requirement into a traceable list. Assign stable review IDs such as `FR-001`, `FR-002`, etc.
5. Preserve the requirement's intent and terminology. Do not silently rewrite or augment requirements.
6. Record ambiguous, duplicate, contradictory, or untestable requirements as review questions.

Do not assume that every file under `specs/` is a functional requirement. Classify the documents and explain which ones were treated as requirements.

### Stage 3 — Read architecture documents

Read the relevant documents in `specs/architecture/`, including the architecture design, component and sequence diagrams, deployment/security design, implementation plan, and native bridge contract where present.

Compare the documented target architecture with the verified current implementation.

Pay particular attention to:

- Web presentation versus native Android responsibility boundaries.
- Shared audio recording versus engine-specific transcription.
- Whisper and Groq engine abstraction.
- Engine selection and readiness.
- Model lifecycle and download recovery.
- Native bridge commands, events, payloads, and error handling.
- Transcript normalization and persistence.
- Persistent configuration versus transient runtime state.
- API-key handling and audio privacy.
- Offline guarantees.
- Android lifecycle, background execution, and resource limits.

Do not assume the proposed architecture is already implemented. Identify what can be reused and what would require changes. If an architecture recommendation is inconsistent with the actual platform or current implementation, explain the evidence and propose a decision for review rather than silently changing the design.

### Stage 4 — Inspect the wireframes

Review the relevant assets in `specs/visualwireframes/`.

- Inspect image wireframes visually, not only their filenames.
- Read any accompanying text, annotations, interaction specifications, or state descriptions.
- Identify each distinct screen, modal/dialog, component, navigation path, and important UI state.
- Compare the actual implemented screens with the intended wireframes.
- Note differences in layout, hierarchy, terminology, engine status, recording controls, empty/loading/error states, and settings flows.
- Do not treat a visual mockup as proof of backend behaviour.
- If an asset cannot be rendered or inspected, record that limitation rather than guessing.

Specifically assess the user journeys for:
1. First-time Offline (Whisper) setup and model download.
2. Returning Offline user.
3. First-time Online (Groq) setup and API-key configuration.
4. Returning Online user.
5. Switching between modes.
6. Recording, pausing, resuming, stopping, and transcription.
7. Model download progress, cancellation, failure, and retry.
8. Missing/invalid Groq credentials and connection failures.
9. Transcript actions and Activity Trail.
10. Application restart and restored configuration.

### Stage 5 — Build a traceable gap analysis

Create a requirements-to-implementation matrix with these columns:

| ID | Requirement | Source document/section | Current implementation evidence | Status | Gap / observation | Impact / priority | Validation needed |
|---|---|---|---|---|---|---|---|

Use only these statuses:

- **Implemented** — behaviour is verified in code and/or a relevant test.
- **Partially implemented** — some but not all required behaviour is present.
- **Missing** — no implementation was found after an appropriate search.
- **Unclear** — evidence is insufficient to determine behaviour.
- **Conflict** — current implementation, requirements, architecture, or wireframes disagree.

Do not mark a requirement implemented based only on a component name, placeholder, TODO, or unconnected button. Cite specific code/test evidence.

Group findings into:
- Functional behaviour.
- UI/UX and wireframe alignment.
- Architecture and modularity.
- Native bridge and lifecycle.
- Audio and transcription.
- Model management.
- Security and privacy.
- Persistence and state management.
- Reliability and error handling.
- Testing and deployment.

### Stage 6 — Identify risks and design decisions

Identify material issues, including where relevant:

- Groq credentials exposed to JavaScript or ordinary browser storage.
- Audio unexpectedly crossing the web/native boundary.
- Offline mode depending on network access or Groq credentials.
- Silent mode fallback or unexpected cloud upload.
- Duplicate recording or engine lifecycle logic.
- Model files being treated as ready before integrity validation.
- Vulkan/CPU fallback regressions.
- Lost or duplicated bridge events.
- Recording interruption when the WebView backgrounds or is recreated.
- Stale or conflicting sources of truth for engine/recording state.
- Temporary audio retention and cleanup.
- Missing cancellation, timeout, retry, or recovery behaviour.
- UI states that do not reflect native engine readiness.

For each risk, state:
- Evidence.
- User or operational impact.
- Severity.
- Recommended mitigation.
- Whether it needs a product/architecture decision.

Separate verified defects from potential risks that still need device or runtime validation.

### Stage 7 — Produce a phased enhancement plan

Provide a prioritized plan that minimizes regression risk.

For each proposed work item, include:

- Priority: P0 / P1 / P2.
- Objective and user value.
- Requirements and wireframes addressed.
- Likely source areas/files to change, based on repository evidence.
- Dependencies and prerequisites.
- Implementation notes.
- Acceptance criteria.
- Automated tests and device/manual validation required.
- Risks and rollback considerations.

Prefer small, reviewable increments. Preserve existing working Whisper and Groq integrations unless evidence demonstrates they must change.

Do not propose a wholesale rewrite or introduce a new framework/container merely because it appears in a reference architecture. Verify the current stack first and recommend the smallest viable migration.

## Required deliverables

Create the review report at:

`specs/review/current-implementation-review.md`

Create `specs/review/` if it does not already exist. This should be the **only repository file you create or modify** during this task. Do not modify application source, tests, configuration, package manifests, wireframes, architecture specifications, or generated OpenWiki pages.

The report must contain:

1. Executive summary.
2. Repository/branch/commit reviewed and review date.
3. Current-state architecture and source-code map.
4. Current end-to-end Online and Offline workflows.
5. Inventory of functional requirements documents reviewed.
6. Inventory of architecture and wireframe documents reviewed.
7. Requirements-to-implementation traceability matrix.
8. Screen-by-screen wireframe alignment review.
9. Architecture gap analysis.
10. Security, privacy, reliability, and performance risks.
11. Test coverage and validation results.
12. Prioritized phased enhancement roadmap.
13. Open questions and decisions requiring user approval.
14. Files and areas likely to be touched in the implementation phase.

Use Mermaid diagrams where they materially clarify the current implementation or proposed change. Label current-state diagrams separately from proposed target-state diagrams.

## Final response to the user

After creating the report, provide:

- A concise summary of the most important findings.
- The path to `specs/review/current-implementation-review.md`.
- The number of requirements reviewed and their status counts, if these can be established.
- The highest-priority gaps.
- Tests/checks actually run and their results.
- Any inaccessible documents, uninspectable wireframes, or unverified device behaviours.
- Decisions that need the user's approval before implementation.

## Strict stop conditions

- **Do not implement enhancements in this task.**
- Do not modify source code, tests, build files, dependency manifests, existing specifications, or generated OpenWiki content.
- Do not make speculative claims about implementation behaviour.
- Do not conceal conflicts between requirements, architecture documents, wireframes, and code.
- Do not claim a test or device scenario passed unless it was actually executed.
- Stop after delivering the evidence-based review and phased plan. Wait for approval before starting implementation.

# GitHub Copilot Agent — Convert Review Findings into an Implementation Backlog

## Objective

Convert the completed implementation review at `specs/review/current-implementation-review.md` into a prioritized, dependency-aware task backlog.

**This is backlog preparation only. Do not modify application code, tests, build configuration, wireframes, architecture specifications, or dependencies.**

## Read first

1. Read `AGENTS.md` and applicable nested instructions.
2. Read `specs/implementation/README.md` and `specs/implementation/backlog.md`.
3. Read `specs/review/current-implementation-review.md` completely.
4. Read only the functional requirement, architecture, and wireframe references needed to clarify individual findings.
5. Inspect relevant source/tests only when needed to validate that a proposed task is still applicable. Do not perform implementation changes.

## Task decomposition rules

Create tasks from evidence-backed gaps in the review.

Each task must:
- Address one cohesive user-visible or technical outcome.
- Have a stable unique ID, such as `DIC-001`.
- Reference the review finding and original functional requirement IDs.
- Reference relevant architecture and wireframe documents/sections.
- State the observed problem and expected outcome.
- Define explicit scope and exclusions.
- Identify likely source/test areas to inspect.
- Define testable acceptance criteria.
- Define automated, build, regression, and device validation as applicable.
- List dependencies on other tasks.
- Have a justified priority: P0, P1, or P2.
- Begin with status `Backlog` or `Ready`, depending on whether its scope and dependencies are sufficiently clear.

## Decomposition guidance

- Prefer small vertical slices that can be implemented and validated independently.
- Split broad recommendations that span multiple user journeys or architectural boundaries.
- Keep prerequisite work explicit. Do not create false dependencies.
- Avoid tasks that duplicate existing functionality.
- Do not create a task for an issue already verified as fixed.
- Separate defects from optional improvements.
- Do not convert every observation into implementation work. Some findings may need a product decision, clarification, or device investigation first.
- Do not invent implementation details or assume a specific technology not verified by the review.
- Do not make every task P0. Prioritize based on user impact, security, correctness, dependency order, and risk.
- Do not group unrelated changes simply to reduce the number of tasks.

## Priority guidance

- **P0:** Critical correctness, security, data integrity, or essential user journey issue.
- **P1:** Important user experience, reliability, architecture, or feature gap.
- **P2:** Lower-risk polish, maintainability, or optimization.

## Dependency guidance

A task can be `Ready` only when:
- Scope is sufficiently clear.
- Acceptance criteria are testable.
- Required decisions are resolved.
- Every dependency is either absent or already `Verified`.

Use `Blocked` only when an external decision, environment, or dependency prevents planning or execution. Use `Backlog` for tasks that need refinement.

## Deliverables

Update only:
- `specs/implementation/backlog.md`
- `specs/implementation/execution-log.md` (append a backlog-preparation entry)

Do not modify the review report; treat it as the source assessment.

In `backlog.md`:
1. Replace the example task with the actual review-derived tasks.
2. Assign stable IDs.
3. Order by priority and dependency sequence.
4. Include the full task template fields for every task.
5. Update the queue summary.
6. Add unresolved product/architecture decisions to the decisions table.
7. Identify which task is the first eligible `Ready` task.

In the execution log, record:
- Review report used.
- Number of tasks created.
- Priority distribution.
- Dependencies and unresolved decisions.
- Any findings intentionally not converted into tasks and why.

## Final response

Summarize the created backlog, explain the first recommended task, identify unresolved decisions, and confirm that no application code was changed.

Stop after backlog creation. Do not start implementing the first task.

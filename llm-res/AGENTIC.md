# AGENTIC.md

Standing rules for any LLM/agent working on my code, in any language. Apply these by default, without being asked. Don't ask for confirmation on each item - just follow them, and flag it if a request conflicts with one.

Directory map and agent reading order: `README.md`. State files live beside this one: `INIT.md`, `PHASE.md`, `MEMORY.md`, `THREAT.md`. This whole directory is installed in a project as `llm-res/`.

## Rules at a glance

- **Naming**: snake_case identifiers/files, except `*.md` docs are UPPERCASE; code casing follows the language linter (zero warnings).
- **Comments** minimal; **KISS** - no speculative abstractions.
- **No em dash** (U+2014): where a dash is needed, use the ASCII hyphen-minus `-` (section 2).
- **Atomic builds**: phase-based, one micro-task at a time; each leaves zero warnings + tests green.
- **Test hygiene**: dev/test servers bind only to 127.0.0.1; clean up servers + artifacts after every pass.
- **`PHASE.md` + `THREAT.md` mandatory**, updated after every micro-task; top of file = current state + next task.
- **Orient first**: confirm project root + paths with `pwd`/`ls` - never from memory; record in `PHASE.md`.
- **Strict secure SDLC by default**; "simple app" → ask before downgrading, never self-downgrade.
- **Secrets** only in `.env`, `.env.example` synced in the same micro-task.
- **No unsafe code** in any language; no risky safe-code footguns.
- **Git**: `.gitignore`, no secrets, one atomic commit per micro-task.
- **Versioning**: SemVer; every deployed commit is tagged `vX.Y.Z-{commit}` so the deployed commit is traceable (section 11).
- **Memory**: append to `MEMORY.md` immediately after every action, never waiting for session end, so a dead agent leaves a usable record (section 12).
- **Init first**: fill `INIT.md` (project name, tech stack, commands) with the user before `phase_01` - never guess the stack (section 0).
- **Rules location**: every agentic rules file lives in the project's `llm-res/` directory, never at the repo root (section 1).
- **UI/UX**: Google Material 3, light/dark/auto themes, mandatory subtle animation with anime.js (section 13).
- Rule conflicts with a request → say so, don't silently comply.

## 0. INIT.md - project initiation, filled before any code

`INIT.md` (UPPERCASE `*.md` per section 1, inside the project's `llm-res/` directory) is the project's setup contract. It is filled **once, at the start of a new project, before `phase_01` and before any app code is written**, at the same point the other project files are seeded.

- Copy the boilerplate `INIT.md` template into the new project's `llm-res/` directory.
- **Fill every field by asking the user for what is missing.** Do not invent a project name, tech stack, database, auth mechanism, or deploy target from assumptions. Ask the smallest set of questions that removes the blanks, then show the filled file back to the user for confirmation.
- **Never leave a required field blank** (`TODO`, `?`, empty). If a value is genuinely not applicable, write `none` and why. If it is undecided, write `undecided` and list it under Open questions - it must be resolved before the phase that needs it.
- **Bootstrap gate**: do not start `phase_01` until `INIT.md` is filled and confirmed. Then, as the first actions of the project:
  1. copy its identity, paths, and canonical commands into the `PHASE.md` Workspace block (section 5), so no later session has to guess them,
  2. record the initialization as the first `MEMORY.md` entry (section 12),
  3. seed `THREAT.md` (section 6) from the chosen stack, data handled, and trust boundaries.
- Keep `INIT.md` current: when the stack, commands, data handling, or deploy target change, update it in the same micro-task.
- The build/lint/test commands in `INIT.md` are the **canonical verify commands**. If they do not work, fix the project or the file - never silently run a different command.

## 1. Naming

Default: **snake_case** for all identifiers (functions, variables, classes, files).

Exception: when a language has its own strongly enforced convention - via the compiler, a standard linter, or the ecosystem's near-universal norm - follow *that* instead, because "zero warnings" beats "snake_case everywhere." Known exceptions:

| Language | Convention to use instead | Why |
|---|---|---|
| Go | camelCase (unexported), PascalCase (exported) | `staticcheck`/`golangci-lint` flags snake_case (ST1003) |
| Rust | snake_case for fns/vars, PascalCase for types/structs/traits | enforced by `rustc`/`clippy` warnings |
| Java / Kotlin | camelCase (methods/vars), PascalCase (classes) | JVM ecosystem convention, enforced by most linters |
| JavaScript / TypeScript | camelCase (vars/functions), PascalCase (classes/components) | ESLint/Prettier default, near-universal |
| C# | PascalCase (public members), camelCase (locals) | .NET convention, enforced by analyzers |

If a language isn't listed here, default to snake_case unless its standard formatter/linter (the one most projects in that language actually use) disagrees - then follow the formatter, and note the exception here.

Wherever a language does NOT dictate casing - JSON/API field names, `.env` and config keys, log field keys, DB column names, URL routes/slugs, file and directory names - always use **snake_case**, regardless of the source language. This is the consistent signature layer across every project.

**Exception - `*.md` files are UPPERCASE.** Markdown state and documentation files use all-caps names, regardless of language. All agentic files live together in the project's `llm-res/` directory (the directory this file is in), never scattered at the repo root: `AGENTIC.md`, `INIT.md`, `PHASE.md`, `THREAT.md`, `MEMORY.md`, `README.md`. A project may also have its own root `README.md`; that is not one of these rules files. This is the only filename-casing exception - every other file type stays snake_case. Record any new agentic doc in this directory here so the reserved names never read as violations.

Every project must build/lint with **zero warnings** under its language's standard linter. Naming convention choice is subordinate to this.

## 2. Comments & text

Minimal. A short comment may describe what a function or module does. Never explain individual lines or restate what the code already says.

**No em dashes.** Never emit the em dash character (U+2014) in any text this project produces: code comments, markdown/docs, commit messages, log messages, UI copy, error strings, or agent replies. Where a dash is needed, use the ASCII hyphen-minus `-` (U+002D). This applies when editing existing files too: any em dash on a line you touch is replaced with `-` in the same edit.

## 3. Simplicity (KISS)

No unnecessary abstractions, layers, or dependencies not justified by the actual task. No speculative generalization ("might need this later").

## 4. Development process - atomic, phase-based

Every piece of software is built in **phases**, and every phase is built from **micro-tasks**. Never implement a whole app (or a whole phase) in one shot.

- A **phase** is one coherent milestone covering a named set of features (e.g. `phase_01_authentication`, `phase_02_user_profile`). Phases build on each other in order; a phase is not started until the previous one is complete and verified.
- A **micro-task** is the smallest unit of work that delivers one specific feature or behavior change. It must be **atomic**:
  - does exactly one thing,
  - leaves the project building with zero warnings and all tests passing,
  - is small enough to review and commit as a single logical unit.
- Work **one micro-task at a time**. No parallel tracks, no long-running branches, no half-finished features merged "for later."
- Every micro-task follows the same loop:
  1. **State the task** - name the micro-task and the phase it belongs to.
  2. **Implement** the smallest change that satisfies it.
  3. **Verify** - build, lint, and run the relevant tests; zero warnings, all green.
  4. **Security pass** - apply section 7 (security) to this change, and update `THREAT.md` (section 6) if the change introduces or mitigates a threat.
  5. **Clean up** - tear down everything the verification started (test hygiene below) and restore the tree to a clean state.
  6. **Record** the outcome in `PHASE.md` (section 5).
- **Test hygiene - loopback only, clean after every run.**
  - Development and test servers bind **only** to the loopback interface **127.0.0.1**. Never listen on `0.0.0.0`, a wildcard host, or any other interface - default every dev server, API, worker, and preview to `127.0.0.1` so nothing is reachable on the LAN or public network. If a binding address is ever ambiguous, use the literal `127.0.0.1`.
  - After any verification or test pass, **clean up**: shut down and remove the dev server and any spawned processes, and clear build manifests and temporary artifacts the run produced (e.g. temp dirs, build output, uploaded test files). No orphaned processes, no listening server left behind.
  - If verification fails, still tear down what was started before ending the session or beginning the next micro-task - a failed test is not an excuse to leave the environment dirty.

## 5. PHASE.md - state report, required at all times

A state report named `PHASE.md` (UPPERCASE `*.md` per section 1, inside the project's `llm-res/` directory) is **mandatory** for every project/app. It exists so work survives a network drop, a context compaction, or a fresh session with no shared memory.

- Create `PHASE.md` at the very start of development, before the first micro-task. Seed it from the boilerplate starter template and fill it in as micro-tasks complete; if it goes missing or is empty, rewrite it from the current state before doing anything else.
- **Update it after every micro-task** (the last step of the loop in section 4). Never leave it stale at the end of a session.
- Structure (top of file = the answer to "where are we right now?"):
  1. **Current state** - active phase, the micro-task just finished, the exact next micro-task to start, and any current blockers.
  2. **Verify** - the exact build/lint/test commands that prove the app's state right now, so a fresh session can confirm it before resuming.
  3. **Phase log** - each completed phase and its micro-tasks, newest last.
  4. **Decisions & notes** - design/security decisions and their rationale worth remembering.
  5. **Out of scope** - things deliberately deferred, so they are not re-invented or forgotten.
- A new session or agent must **read `PHASE.md` before touching code**, verify the claimed state against the code, then continue with the stated next micro-task.
- **Orient before acting.** At session start - and after any context compaction or resume - confirm the project root and working directory with `pwd` and `ls`, verify the paths recorded in the PHASE.md **Workspace** block match the real tree, and correct them if they don't. Never guess your location or trust remembered paths; derive everything from the filesystem before reading or writing any file. Record the absolute project root in the Workspace block so it survives a session restart.
- If a micro-task cannot be finished, update `PHASE.md` to record exactly what is done, what is not, and where to resume - never end a session without this.

## 6. THREAT.md - threat model, required for every generated app

A threat model named `THREAT.md` (UPPERCASE `*.md` per section 1, inside the project's `llm-res/` directory) is **mandatory** for every app that is generated or built, alongside `PHASE.md`.

- Create `THREAT.md` during initial planning, before the first phase is implemented, and keep it current for the life of the app. Seed it from the boilerplate starter template and fill it in as threats are identified.
- Represent the model as a table with at least these columns:
  - `threat_id` - short snake_case id (e.g. `t_01_sql_injection`),
  - `description` - what the attacker does and what it yields,
  - `surface` - affected component / entry point / trust boundary,
  - `level` - how certain the threat applies to this app: `certain` (verified present or present by design), `firm` (near-certain from established attack knowledge), `likely`, `possible`, or `speculative` (reasoned guess, cheap to check),
  - `severity` - impact if exploited: `info`, `low`, `med`, `high`, or `crit`,
  - `user_requested` - `yes` or `no`,
  - `mitigation` - the control that addresses it, or an explicit statement that it is intentionally left open.
- Set `user_requested: yes` whenever a threat is part of the user's ask - e.g. a security-challenge / CTF / deliberately-vulnerable app where the user explicitly wants the app to be vulnerable to a threat. Those threats are documented and **kept** vulnerable: do not silently "fix" them in a later phase. Hard rule: each deliberately-vulnerable surface gets an explicit marker in code (a `# user_requested_vuln: <threat_id>` comment) and, where practical, a guard test asserting the vulnerability is still reachable, so no future agent "hardens" it by accident.
- Keep `THREAT.md` in sync with the code: update it whenever a micro-task introduces, mitigates, or removes a threat (step 4 of the section 4 loop), in the same session, so a network drop or compaction never leaves the model stale.
- Threat modeling is part of every phase plan: before starting a phase, note the threats its new surface introduces, and carry them through implementation.

## 7. Security - strict SDLC by default; "simple app" requires explicit confirmation

**Default: a strict, secure SDLC is applied to every build, non-negotiable.** This includes:

- **OWASP baseline**: validate and sanitize every input that crosses a trust boundary; reject early, never trust - including input from internal services. Injection prevention, output encoding, secure session handling.
- **Identity & access**: RBAC with least privilege, deny by default. Strong auth even for single-user apps: strong passwords, JWT minimum HS256 with a secret ≥ 64 bytes.
- **Threat modeling**: maintain the `THREAT.md` model (section 6); treat every row as an acceptance criterion.
- **Testing with security intent**: unit/integration tests, negative and edge cases, auth bypass attempts, and input abuse cases - not just the happy path.
- **Dependencies**: audit third-party dependencies for known vulnerabilities before and during development.
- **Logging**: log every request, response, error, and access decision. Never log passwords, tokens, secrets, or full sensitive payloads.
- **Secrets & config**: per section 8.
- **Review gate**: no micro-task is complete until its security pass (section 4, step 4) is satisfied.

**The only downgrade path is explicit.** If the user states the app is a **simple app** that does not require bank-grade/enterprise security, you **must ask** before reducing anything: confirm what the app handles (no sensitive data, single local user, no real money, etc.), state what is being relaxed and what still stands (input validation, secrets handling, dependency audit are never dropped entirely), and record the agreed level in `PHASE.md`. Never downgrade security on your own judgment, and never assume a downgrade was granted in a previous session without it written down. A THREAT.md is maintained at **every** tier - at minimum the rows stay accurate, and any `user_requested` threat (e.g. a deliberately vulnerable challenge app) stays flagged `yes` and left open regardless of tier.

## 8. Secrets & config

- All secrets and config values go in `.env`. Never hardcode secrets, never rely on system-level environment variables for app config.
- Every project ships a `.env.example` with placeholder values for every required key, kept in sync as keys are added or renamed.
- When a micro-task adds or renames a config key, update `.env.example` in the same micro-task (atomic loop, section 4) - never leave them out of sync at a session boundary.

## 9. No unsafe code

Never write code that bypasses a language's safety model:

- **Rust**: no `unsafe` blocks, `unsafe fn`, or raw pointers. If a task appears to need `unsafe`, stop and reconsider the design first.
- **Every other language**: no equivalents - no manual memory management, no unchecked/unvalidated pointer arithmetic, no unsafe/unchecked casts, no calling into C/FFI unless strictly required and justified in the task description.
- Avoid **risky safe-code** patterns unless explicitly covered by the task and reviewed:
  - indexing or slicing without bounds handling,
  - `unwrap()`/panics/`!` used as control flow rather than real error propagation,
  - building SQL or shell commands by string concatenation,
  - silent catch-all error swallowing.
- If "unsafe" would genuinely be the correct tool, say so first and get explicit approval - never reach for it silently.

## 10. Git hygiene

- Every project gets a `.gitignore`, even before a git repo is initialized. It must exclude `.env`, credentials/keys, build artifacts, dependency directories, and local data files.
- Never let `.env` or any real secret get staged for commit.
- Commits stay atomic and match micro-tasks (section 4): one logical change per commit, message describing that change.

## 11. Versioning & release tags

Every deployed build is versioned with **SemVer** (`MAJOR.MINOR.PATCH`) and tagged in git as:

```
vX.Y.Z-{commit}
```

- `v` - literal lowercase prefix.
- `X.Y.Z` - SemVer `MAJOR.MINOR.PATCH`.
- `{commit}` - the short commit SHA (7+ chars) of the **exact commit that was deployed**. The tag resolves to the full SHA.

Examples: `v1.4.2-a3f9c21`, `v0.3.0-7b2e0d4`.

**Bump rules** - applied to the public contract (API routes/shapes, config keys, on-disk schema, CLI flags):

- **MAJOR** - incompatible change: breaking API/route/schema/config change, removing or renaming a field/key, an irreversible data migration.
- **MINOR** - backward-compatible feature: new endpoint, new optional config key, new capability.
- **PATCH** - backward-compatible fix: bug fix, security patch, dependency bump with no behavior change.
- While the project is `0.y.z`, a MINOR bump may contain breaking changes (standard pre-1.0 SemVer convention); record it under **Decisions & notes** in `PHASE.md`.
- Bump **once per release**, not per micro-task. The version is bumped when a build is deployed (end of a phase, or any commit that reaches a real environment); micro-tasks inside one deploy share that version.

**Tagging rules**:

- Tag the **exact deployed commit** - never a later commit, a branch head, or a merge commit that wasn't deployed. The tag's commit is the deployment record.
- Use **annotated** tags: `git tag -a v1.4.2-a3f9c21 -m "release 1.4.2 (a3f9c21)"`.
- **Never move, reuse, or delete a published tag.** A bad deploy is superseded by the next PATCH version and a new tag, never by retagging.
- Each deployed build gets its own tag. The same `X.Y.Z` may appear on more than one commit when tracking development/staging deploys - the commit suffix distinguishes them. A production release should normally get a fresh version bump.
- No floating tags (`latest`, `stable`, `prod`). Deploy **by tag**, never by branch, so the running artifact is reproducible.
- Record the current version in the `PHASE.md` **Current state** block at every bump (section 5).

**Verify before pushing a tag**:

- `git rev-parse --short HEAD` matches `{commit}` in the tag name.
- `git describe --tags --exact-match` on the deployed commit returns the tag.
- The working tree is clean and the tag points at a commit already pushed to the remote.

Note on the `-` separator: SemVer treats `-suffix` as a **prerelease**, so `v1.4.2-a3f9c21` sorts *below* `v1.4.2`. That is intentional here - the suffix marks a deployed build, not a release candidate. If precedence-sensitive tooling ever needs the commit attached without changing sort order, the strict-SemVer equivalent is build metadata: `v1.4.2+{commit}`.

## 12. MEMORY.md - continuous action log

`MEMORY.md` (UPPERCASE `*.md` per section 1, inside the project's `llm-res/` directory) is a **mandatory, continuously written** action log. It exists so an agent that dies, is killed, or is compacted mid-process leaves a usable record of what it actually did and where it stopped.

- Create it at project start, in `llm-res/`, next to `PHASE.md`. Seed it from the boilerplate starter template.
- **Write after every action, immediately - never wait for session end, a checkpoint, or a "good stopping point."** At minimum, append an entry after each step of the section 4 loop and after every tool-verified change.
- **Before any long or risky operation** (large refactor, migration, dependency install, destructive command, long build/test run), first append a `start` entry naming what you are about to do and why, so a crash mid-operation is explainable.
- Append one entry per event, newest first at the top. Format:

  ```
  - <ISO-8601 UTC> | <phase> / <micro_task> | <status> | <what happened + next step> | <files touched> | <verify result>
  ```

  `status` is one of `start`, `done`, `failed`, `blocked`, `stopped`. Generate the timestamp with `date -u +%Y-%m-%dT%H:%M:%SZ`.
- **Append-only.** Never rewrite or delete history. Correct a mistake with a new entry that says so.
- **No secrets, no secret values, no tokens or credentials** - name the key only. This file is committed and readable.
- Keep each entry to 1-3 lines; it is a log, not a narrative. Detail lives in `PHASE.md` (section 5) and the code.
- On any stop, clean or forced, append a `stopped` entry stating exactly what is done, what is not, and the next concrete step. Never end a session without it.
- A new agent reads `MEMORY.md` (newest first) after `PHASE.md` to see the last actions before verifying and resuming.

## 13. UI/UX design system - Material 3, dual theme, anime.js

Every app with a user interface uses **Google Material Design 3 (M3)** as its design system. No ad-hoc styling and no alternative kit unless the user explicitly overrides this rule.

- **Design language**: use the framework's Material 3 implementation rather than hand-rolled equivalents: Material 3 for the web (`@material/web`, MUI, or MDC), Jetpack Compose Material3, Flutter Material 3, .NET MAUI Material, or the platform's current Material library. Components, spacing, shape, elevation, state layers, and motion follow the M3 spec.
- **Theme: light + dark + auto.**
  - Implement three states: `light`, `dark`, `auto`.
  - `auto` follows the OS/browser `prefers-color-scheme` and updates live when the system setting changes.
  - Default on first run is `auto`. Persist the user's explicit choice (`auto` is a stored choice, not "no choice").
  - Generate both palettes from the M3 tonal system using one seed/source color. Use M3 color roles (`primary`, `on_primary`, `surface`, `on_surface`, etc.) and M3 tokens. Never hardcode raw hex values in components.
  - Apply the theme by switching the M3 token values at the root (`--md-sys-color-*` custom properties on the web, `MaterialTheme` in Compose/Flutter). No per-component theme branching.
  - The theme toggle is available in the UI, not buried in code; it must be keyboard accessible.
- **Motion is mandatory.**
  - Every app animates. A static UI is not acceptable.
  - Use **anime.js** (v4+) as the animation engine. Do not add another animation library unless the user explicitly approves it.
  - Cover the M3 motion patterns: screen/page transitions, component enter/exit, state changes, and feedback (press, hover, focus, drag, success/error). Use M3 easing and duration tokens where the platform exposes them.
  - On platforms where anime.js cannot run (native mobile/desktop), use that platform's Material motion APIs and record the deviation in `INIT.md`.
- **Motion must not distract.**
  - Keep UI transitions short, roughly 150-300 ms, with M3 standard easing.
  - No infinite loops on content; loops are allowed only for legitimate progress/loading indicators.
  - No flashing, strobing, auto-playing background motion, parallax, or large-area motion competing with the task.
  - No scroll-linked motion unless it communicates state. No animation on every interaction.
  - Every animation must communicate state change, hierarchy, cause/effect, or feedback. If it only decorates, cut it.
  - Respect `prefers-reduced-motion`: reduce to opacity/near-instant changes and keep only essential feedback. Motion settings are never ignored.
- **Accessibility**: WCAG AA contrast in both themes, visible focus states, full keyboard navigation, touch targets of at least 48dp, and support for font scaling.
- **Override**: if the user asks for a different design system, say so, get explicit confirmation, and record the override in `INIT.md` and under **Decisions & notes** in `PHASE.md`.

## 14. When rules conflict with a request

If what's being asked would violate any rule above (e.g. "just hardcode the API key for now," "skip validation, it's just a prototype," "skip PHASE.md and do the whole thing at once"), say so before doing it. Don't silently comply.

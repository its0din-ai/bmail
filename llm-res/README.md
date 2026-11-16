# project-boilerplate

Language-agnostic starting point for any new project. No code - just the rules and files that should exist before the first line of app code is written.

This directory is installed into each project as `llm-res/`: copy it to `<project>/llm-res/` (or clone it and rename the folder). Never nest it as `llm-res/llm-res/`. All agentic files referenced here live in this same directory, never scattered at the project root.

## Files

| File | Role | Read | Update |
|---|---|---|---|
| `README.md` | Entry point: file map, reading order, session checklist | First | When the structure changes |
| `AGENTIC.md` | Static rules - the single source of truth for how to work | Always, after this file | Only when a rule changes |
| `INIT.md` | Project setup record: name, stack, paths, commands | Before `phase_01`; at session start for stack/commands | At project start; when stack, commands, or deploy target change |
| `PHASE.md` | Current state snapshot: phase, next task, blockers, verify commands | At session start, after `AGENTIC.md` | After every micro-task |
| `MEMORY.md` | Append-only action log, newest first | After `PHASE.md`, to see the last actions | Immediately after every action, never at session end |
| `THREAT.md` | Threat model for the app | At session start and before phase planning | When a threat is added, mitigated, or removed |

Project-level starter files, moved outside `llm-res/`: `.gitignore` and `.env.example`.

## Agent reading order

1. `README.md` (this file) - orientation and file map.
2. `AGENTIC.md` - the rules. Apply them without being asked; flag conflicts.
3. `INIT.md` - project identity, stack, layout, and canonical commands.
4. `PHASE.md` - where the project is right now and the exact next micro-task.
5. `MEMORY.md` (newest first) - what the last agent actually did, especially if it died mid-process.
6. `THREAT.md` - what must stay secure, and any deliberately open threats.

## Usage

1. Copy this folder into the new project as `llm-res/` (rename the copied folder; do not create `llm-res/llm-res/`).
2. Move `.gitignore` and `.env.example` from `llm-res/` to the project root so they apply to the whole project, then adjust and fill them there.
3. In `llm-res/`, fill in `INIT.md` with the project name, tech stack, layout, design system, and canonical commands - ask the agent to complete it rather than guessing.
4. In `llm-res/`, fill in `PHASE.md` (current phase, next micro-task, verify commands) and `THREAT.md` (first-pass threat model) before writing app code. Keep `MEMORY.md` in place and append to it continuously during work.
5. Point your LLM/agent at `llm-res/README.md` at the start of the session; it gives the reading order and routes to `AGENTIC.md` for the rules (or paste `llm-res/AGENTIC.md` into the system prompt) so it applies them without being asked each time.

## Conventions

- `*.md` names are UPPERCASE (AGENTIC.md section 1).
- Rules files are static; state files (`INIT`, `PHASE`, `MEMORY`, `THREAT`) are mutable and expected to change during work.
- `MEMORY.md` is append-only: correct a mistake with a new entry, never delete history.
- Never put secrets or secret values in any of these files.

## Session start checklist

- [ ] Confirm the project root and `llm-res/` paths with `pwd`/`ls`, never from memory.
- [ ] Read `AGENTIC.md`.
- [ ] Verify the `PHASE.md` state against the code before trusting it.
- [ ] Read the latest `MEMORY.md` entries for context the state snapshot may miss.
- [ ] Check `THREAT.md` for open or deliberately vulnerable surfaces before changing code.

## Naming signature

Code identifiers follow whatever convention keeps that language's linter at zero warnings (see the table in `AGENTIC.md`). Everything else - JSON fields, `.env`/config keys, log keys, DB columns, routes, file names - is snake_case, on purpose, in every project regardless of language. That consistency is what makes it recognizable.

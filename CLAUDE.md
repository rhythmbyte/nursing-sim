# CLAUDE.md — Nursing Sim

Read `SPEC.md` before starting any work. It is the source of truth for the data model, folder layout, and screens.

## Secrets (non-negotiable)

- Never look at, open, read, write, edit, or search `.env` files or any `.env.*` variant (`.env.local`, `.env.production`, etc.), and never print their contents. This covers every tool and shell command (`cat`, `less`, `head`, `tail`, `grep`, editors, scripts). `.claude/settings.json` enforces this with deny rules; don't remove them.

## First-run setup (do this before anything else if it isn't done yet)

1. If this folder is not a git repo, initialize it (default branch `main`).
2. If there is no GitHub remote, create a new GitHub repo for it with the `gh` CLI and push the initial commit.
   - Before creating it, ASK Brian: which account or org should own it, and what to name it.
   - Note for Brian: free GitHub Pages hosting requires the repo to be public (unless the account is on a paid plan). Patient content here is fictional, so public is fine, but confirm with him.
3. Make sure `.claude/hooks/autosave.sh` is executable.
4. Once pushed, offer to enable GitHub Pages (deploy from `main`, root folder) so the demo has a live URL.

## Save and push often (this machine can freeze)

- Commit and push after every meaningful unit of work: a new file, a working feature, a fixed bug, a finished data file. Never batch a long session into one commit.
- If a task will take more than ~15 minutes, commit and push partial progress at sensible checkpoints, even if unfinished (prefix the message with `wip:`).
- A Stop hook (`.claude/hooks/autosave.sh`) also commits and pushes anything left uncommitted at the end of every turn. It is a safety net, not a replacement for real commits with real messages.
- At the start of every session, run `git status` and `git pull` so you never build on stale files.
- Commit messages: short, imperative, plain. Do NOT add `Co-Authored-By`, session links, or "Generated with Claude Code" lines to commits or PR descriptions.

## Modularity rules

- Patients, scenarios, and catalogs are DATA (`data/**/*.json`). Never hard-code clinical content in JS.
- Engine logic (`js/engine/`) never touches the DOM. Screens (`js/screens/`) never contain sim rules.
- Every event type is its own file in `js/engine/events/` and registers itself with the event registry. Adding a new type (e.g. EMS arrival) = one new file + one registry line.
- Every flag rule is its own file in `js/engine/rules/` and registers with the rule registry.
- All persistence goes through `js/storage.js`. Nothing else touches `localStorage`.
- Chart sections are separate components in `js/screens/chart/`.
- No build step. Plain ES modules so GitHub Pages serves the repo as-is.
- Keep files small and single-purpose. If a file passes ~300 lines, split it.

## Suggestions and feedback

- Proactively suggest improvements to features, UX, and the sim design. Label them clearly as suggestions, and don't build them without asking.
- Say plainly when a request isn't possible (or isn't practical) in the static GitHub Pages prototype. Explain what it would take instead, and whether it should wait for the full build.
- Call out anything that would hurt modularity or make the move to the real website harder (hard-coded content, logic in screens, direct `localStorage` use, tight coupling), and propose the fix.
- This prototype will become a real website with logins, a backend, and multi-device realtime. Make design choices that carry over to that, and record anything that will need to change in SPEC.md §13 ("Full-build migration notes").

## Clinical content

- Any field or object with `"review": "proposed"` was drafted by AI, not the instructor. Never remove that tag; only the instructor approves content. The instructor UI shows these with a "Needs review" badge.
- Do not change clinical values in patient files without asking Brian.

## Working with Brian

- He prefers the terminal. When he asks how to do something in git or the shell, describe what needs to happen and let him write the command unless he asks for it outright.
- When he asks for a commit message, give just the message in a copyable block.
- One step at a time when walking him through setup.

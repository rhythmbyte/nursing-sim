# Nursing Sim

Multi-student, multi-patient nursing simulation for prioritization, delegation, and critical thinking. Prototype: one static page with a tab per role, hosted on GitHub Pages.

- `SPEC.md` — full design (data model, screens, rules, build phases)
- `CLAUDE.md` — rules for Claude Code (save/push cadence, modularity)
- `docs/ARCHITECTURE.md` — code structure, module boundaries, how-tos
- `docs/DECISIONS.md` — design decision log
- `CHANGELOG.md` — what changed per phase
- Live demo: https://rhythmbyte.github.io/nursing-sim/
- `data/` — patients, scenarios, catalogs (all content is data, not code)

Patient content marked `"review": "proposed"` is drafted and awaits instructor review.

## Run locally

The page loads JSON with `fetch`, so serve the folder instead of opening `index.html` from disk:

```
python3 -m http.server 8000   # then open http://localhost:8000
```

New patient or scenario files must also be listed in `data/manifest.json`.

## Tests

```
node --test tests/
```

These validate every data file against `data/schemas/` and cover the pure modules. They're dev-only; the site itself has no build step.

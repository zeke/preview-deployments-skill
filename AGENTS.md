## Project purpose

This repository contains the `preview-deployments-skill` Agent Skill. The skill teaches coding agents how to add per-PR Cloudflare Workers preview deployments to existing GitHub projects using native Worker Previews (`wrangler preview` / `cf previews deploy`), GitHub Actions, and the GitHub Deployments API. A separate-Worker-per-PR flow is kept as a fallback for apps that hit Preview limitations.

## Structure

- `SKILL.md`: primary skill instructions. Keep this compact and task-oriented.
- `references/`: detailed implementation notes loaded only when needed. `worker-previews.md` holds the Worker Previews feature facts; `separate-worker-previews.md` covers the fallback.
- `assets/`: copyable workflow and script templates for target projects. `preview-env.mjs` is the native default; `preview-env-separate-worker.mjs` is the fallback.
- `README.md`: concise human-facing description and installation instructions.

## Validation

- Validate the skill with `npx -y skills-ref validate .` when changing `SKILL.md` metadata or layout.
- The `name` in `SKILL.md` must stay `preview-deployments-skill`, matching this directory name.
- Keep `SKILL.md` under 500 lines. Move details into `references/`.

## Maintenance

- Revise this file whenever meaningful project conventions, validation commands, or skill packaging details change.
- When changing preview deployment guidance, check whether the examples in `assets/` and details in `references/` also need updates.
- When workflow template guidance changes, keep `references/action-versions.md` aligned.
- Worker Previews is in open beta. When updating, re-verify facts in `references/worker-previews.md` against developers.cloudflare.com/workers/previews, the Workers changelog, and `npx wrangler preview --help` / `npx cf cli search`.
- Check JS templates with `node --check assets/*.mjs`.

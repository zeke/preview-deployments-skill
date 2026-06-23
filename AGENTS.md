## Project purpose

This repository contains the `preview-deployments-skill` Agent Skill. The skill teaches coding agents how to add per-PR Cloudflare Workers preview deployments to existing GitHub projects using GitHub Actions and the GitHub Deployments API.

## Structure

- `SKILL.md`: primary skill instructions. Keep this compact and task-oriented.
- `references/`: detailed implementation notes loaded only when needed.
- `assets/`: copyable workflow and script templates for target projects.
- `README.md`: concise human-facing description and installation instructions.

## Validation

- Validate the skill with `npx -y skills-ref validate .` when changing `SKILL.md` metadata or layout.
- The `name` in `SKILL.md` must stay `preview-deployments-skill`, matching this directory name.
- Keep `SKILL.md` under 500 lines. Move details into `references/`.

## Maintenance

- Revise this file whenever meaningful project conventions, validation commands, or skill packaging details change.
- When changing preview deployment guidance, check whether the examples in `assets/` and details in `references/` also need updates.

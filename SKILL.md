---
name: preview-deployments-skill
description: Add Cloudflare Workers preview deployments to existing GitHub apps using GitHub Actions, Wrangler, gh secrets, and the GitHub Deployments API. Use when asked to add per-PR preview deployments, ephemeral Workers previews, preview URLs, GitHub deployment statuses, Cloudflare preview environments, or teardown on PR close.
---

# Preview Deployments Skill

Use this skill to add pull request preview deployments to an existing Cloudflare Workers app.

The default target is a GitHub repository with GitHub Actions, Wrangler, and a Worker deployed to a workers.dev URL. The preview URL should usually be:

```text
https://<app>-pr-<number>.<workers-subdomain>.workers.dev
```

Use GitHub's Deployments API for PR UI status. Do not use issue comments, PR comments, or sticky comments for preview status.

## First Steps

1. Inspect the app before editing.
2. Read `package.json`, `wrangler.jsonc`, existing deploy scripts, and `.github/workflows/*`.
3. Detect Cloudflare bindings: D1, R2, KV, Queues, Durable Objects, Workers AI, Browser Rendering, Vectorize, Hyperdrive, service bindings, assets, containers, cron triggers, and routes.
4. Check whether a `scripts/` or `script/` directory exists and follow that convention.
5. Verify current Wrangler behavior from docs or local `node_modules/wrangler/config-schema.json` before relying on config fields or CLI flags.

## Required Questions

Ask these before implementation if the answers are not clear from the repo or user request:

1. What app name should be used in Worker/resource names and preview URLs?
2. What workers.dev subdomain should previews use?
3. Should previews share production resources, create empty per-PR resources, or create per-PR resources seeded from production?
4. Should preview deploys start before CI finishes? Recommended: yes, keep CI as the merge-readiness signal.
5. Are fork PRs expected? If yes, explain that `pull_request` workflows do not expose secrets to forks and `pull_request_target` is a security-sensitive exception.

## Default Design

- Trigger on `pull_request` events: `opened`, `reopened`, `synchronize`, `ready_for_review`, and `closed`.
- Use `pull_request`, not `pull_request_target`, unless explicitly approved.
- Use per-PR concurrency:

```yaml
concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

- Use workflow permissions:

```yaml
permissions:
  contents: read
  deployments: write
```

- Use deterministic names: `<app>-pr-<number>`.
- Use per-PR GitHub environments, for example `preview/pr-123` or `preview-pr-123`.
- Never use one shared GitHub environment named `preview` for all PRs. GitHub can mark older deployments in the same environment inactive.
- Set repository secrets with `gh secret set`, especially `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Use `npx wrangler`, not a globally installed Wrangler.
- Use JSONC Wrangler config, not TOML.

## GitHub Deployments API

Create a GitHub Deployment for the PR head SHA before deploying. Then create deployment statuses:

- `in_progress` when provisioning starts.
- `success` only after the preview URL is live.
- `failure` if provisioning or deployment fails.
- `inactive` when the PR closes or a stale run should stop advertising a live preview.

Deployment creation should include:

- `ref`: PR head SHA, not just branch name.
- `environment`: per-PR environment name.
- `auto_merge: false`.
- `required_contexts: []`.
- `transient_environment: true`.
- `production_environment: false`.

Deployment statuses should include:

- `environment_url`: preview URL on success.
- `log_url`: GitHub Actions run URL.
- `auto_inactive: false`.
- `description`: under GitHub's status description length limit.

Before marking success, guard against stale runs: if a newer commit has landed on the PR, mark this deployment inactive or failure and do not publish its URL as live.

See `references/github-deployments.md` for API examples and pitfalls.

## Resource Strategies

Choose one strategy explicitly:

- Shared production resources: fastest and realistic, but writes touch production data.
- Empty per-PR resources: safest for writes, but previews may lack realistic data.
- Seeded per-PR resources: safest realistic option, but slower and more complex.

For per-PR resources, generate a temporary Wrangler config during CI instead of committing one environment per PR. Keep production routes out of preview config.

See `references/resource-strategies.md` and `references/cloudflare-resources.md`.

## Cleanup Rules

On PR close or merge:

- Delete the preview Worker.
- Delete per-PR Cloudflare resources only if the selected strategy created them.
- Mark deployments for that PR's environment inactive.
- Tolerate missing resources. Cleanup must be idempotent.

Canceled outdated deploys should not delete per-PR resources by default. A newer run for the same PR may reuse them.

## Implementation Assets

Use these files as templates, adapting names, package manager, Node version, bindings, and resource commands to the target repo:

- `assets/preview.yml`
- `assets/preview-env.mjs`

Do not copy templates blindly. Always reconcile them with the app's existing scripts, config, bindings, and CI style.

## Verification

After editing the target app:

1. Validate YAML syntax if the repo has a tool for it.
2. Run the repo's lint, typecheck, and tests.
3. Confirm required GitHub secrets are present with `gh secret list`.
4. Open or update a PR and verify the GitHub PR shows a Deployment with the preview URL.
5. Close or merge a test PR and verify the Worker and per-PR resources are removed or inactive.

## Common Bugs To Avoid

- Shared GitHub environment deactivating other open PR previews.
- Cleanup marking every preview inactive instead of only the closed PR.
- Using PR comments for status instead of Deployments API.
- Forgetting `deployments: write`.
- Reusing production routes in preview config.
- Deleting per-PR resources from a canceled run while a newer run is starting.
- Assuming fork PRs can access Cloudflare secrets.

See `references/troubleshooting.md` for diagnosis steps.

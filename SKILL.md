---
name: preview-deployments-skill
description: Add per-PR Cloudflare Workers preview deployments to existing GitHub apps using native Worker Previews (wrangler preview or cf previews deploy), GitHub Actions, gh secrets, and the GitHub Deployments API. Use when asked to add per-PR preview deployments, Worker Previews, ephemeral Workers previews, preview URLs, GitHub deployment statuses, Cloudflare preview environments, a previews block in Wrangler config, or teardown on PR close.
---

# Preview Deployments Skill

Use this skill to add pull request preview deployments to an existing Cloudflare Workers app on GitHub.

The default design uses Cloudflare's native Worker Previews: each PR gets a Preview named `pr-<number>` under the existing Worker. A GitHub Actions workflow deploys it, reports status through GitHub's Deployments API, and deletes it when the PR closes. The Preview URL looks like:

```text
https://pr-<number>-<worker>.<workers-subdomain>.workers.dev
```

Read URLs from command output. Do not construct them.

Use GitHub's Deployments API for PR status. Do not post issue comments, PR comments, or sticky comments from the workflow.

## First Steps

1. Inspect the app before editing: `package.json`, Wrangler config or `cloudflare.config.ts`, deploy scripts, and `.github/workflows/*`.
2. Pick the CLI. Use Wrangler if the project has `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml`. Use `cf` if it has `cloudflare.config.ts` or is new. Do not run `cf migrate` unless the user asks.
3. Check the project-local CLI version. Worker Previews need Wrangler `4.135.0` or later. `cf previews delete` needs a recent `cf` beta. Upgrade the devDependency to the latest release, never a global install.
4. Detect bindings: D1, R2, KV, Queues (producers and consumers), Durable Objects, Containers, Workflows, Workers AI, Browser, Vectorize, Hyperdrive, service bindings, assets, cron triggers, routes, and custom domains.
5. Check for an existing `previews` block, `preview_urls`, Workers Builds Preview Builds, `cloudflare/wrangler-action`, or `versions upload --preview-alias`.
6. Check whether a `scripts/` or `script/` directory exists and follow that convention.
7. Verify current behavior from the docs (https://developers.cloudflare.com/workers/previews/), `npx wrangler preview --help`, or `npx cf cli search "<task>"`. The feature is in open beta.
8. Resolve the latest stable GitHub Action versions before writing workflow YAML.

Read `references/worker-previews.md` before configuring Previews.

## Choose An Approach

| Approach                                              | PR UI                         | PR-close cleanup      | Use when                                                                                      |
| ----------------------------------------------------- | ----------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Actions + native Previews + Deployments API (default) | Full Deployment lifecycle     | Yes                   | Most apps                                                                                     |
| Workers Builds Preview Builds                         | PR comment + check runs       | Not documented        | The repo already uses Workers Builds and the user accepts comments and no GitHub Deployments  |
| `cloudflare/wrangler-action@v4` with `gitHubToken`    | One `success` Deployment only | Add it yourself       | The user wants the smallest workflow and accepts weaker status                                |
| Separate Worker per PR (fallback)                     | Full Deployment lifecycle     | Yes                   | The app needs per-PR Queue consumers, Workflows, crons, or service bindings to sibling previews |

Default to the first row. Present alternatives only when the repo or user points at them. For the fallback, read `references/separate-worker-previews.md` and use `assets/preview-env-separate-worker.mjs`.

## Required Questions

Ask these if the answers are not clear from the repo or user request:

1. Which resource strategy should Previews use for account-level bindings: shared staging, shared production, empty per-PR, or seeded per-PR? Skip this if the app only uses Durable Objects, Containers, or API bindings.
2. Do previews need a custom domain, for OAuth redirects, cookies, or CORS? Or is workers.dev enough? Should they be protected with Cloudflare Access?
3. Should preview deploys start before CI finishes? Recommended: yes, and keep CI as the merge-readiness signal.
4. Are fork PRs expected? If yes, explain that `pull_request` workflows do not expose secrets to forks, and that `pull_request_target` is a security-sensitive exception.

## Configure Previews

- Wrangler: add a `previews` block. Repeat every `vars`, `define`, storage binding, Queue producer, Durable Object `env` binding, container, and API binding the code reads, pointed at Preview-safe resources. An empty `previews: {}` is valid when nothing needs repeating. Run `npx wrangler preview --json` without the block to get a `suggested_config`.
- `cf`: return Preview settings from the `ctx.isPreview` branch of a function-form `cloudflare.config.ts`.
- Never put routes, Cron Triggers, or Queue consumers in Preview config.
- workers.dev URLs: set `"preview_urls": true`. It takes effect on the next production `wrangler deploy`.
- Custom domain URLs: add a route with `"custom_domain": true, "previews_enabled": true`. Set `"enabled": false` for Preview-only traffic, then run `wrangler deploy` once.
- Secrets: set shared Preview secrets once with `npx wrangler preview base-config secret put NAME`, or pass `--secrets-file` from CI.
- Durable Objects and Containers are isolated for each Preview automatically. Prefer `ctx.exports` over `env` bindings for Durable Objects.

## Default Design

- Trigger on `pull_request` events: `opened`, `reopened`, `synchronize`, `ready_for_review`, and `closed`.
- Use `pull_request`, not `pull_request_target`, unless explicitly approved.
- Skip jobs for fork PRs with `github.event.pull_request.head.repo.full_name == github.repository`.
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

- Preview name: `pr-<number>`. Always pass it explicitly. The default is the branch name.
- GitHub environment for each PR: `preview/pr-<number>`. Never use one shared `preview` environment for all PRs. GitHub can mark older deployments in the same environment inactive.
- Deploy with `npx wrangler preview --name pr-<number>` or `npx cf previews deploy pr-<number>`.
- Read URLs from `WRANGLER_OUTPUT_FILE_PATH` (type `preview`) or `cf` JSON output.
- Set repository secrets with `gh secret set`, especially `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Use JSONC Wrangler config, not TOML.
- Do not enable Workers Builds Preview Builds for the same Worker.

## Action Version Check

Before writing or updating `.github/workflows/preview.yml`, check the latest tags for every GitHub Action in the workflow, including `actions/checkout`, `actions/setup-node`, and `cloudflare/wrangler-action` if used.

```bash
gh release view actions/checkout --json tagName -q .tagName
gh release view actions/setup-node --json tagName -q .tagName
```

If release lookup fails, use `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name` or `gh api repos/<owner>/<repo>/tags --jq '.[0].name'`. Use the latest stable major tag unless the project pins full SHAs or exact versions by policy.

See `references/action-versions.md`.

## GitHub Deployments API

Create a GitHub Deployment for the PR head SHA before deploying. Then post statuses:

- `in_progress` when provisioning starts.
- `success` only after the Preview URL is live.
- `failure` if provisioning or deployment fails.
- `inactive` when the PR closes or a stale run should stop advertising a live preview.

Deployment creation should include:

- `ref`: PR head SHA, not the branch name.
- `environment`: the per-PR environment name.
- `auto_merge: false`.
- `required_contexts: []`.
- `transient_environment: true`.
- `production_environment: false`.

Deployment statuses should include:

- `environment_url`: the stable Preview URL (`preview_urls[0]`) on success. Put the fixed Deployment URL in the job summary.
- `log_url`: the GitHub Actions run URL.
- `auto_inactive: false`.
- `description`: within GitHub's status description length limit.

Before marking success, guard against stale runs. If a newer commit has landed on the PR, mark this deployment inactive and do not publish its URL as live.

See `references/github-deployments.md`.

## Resource Strategies

Choose one explicitly:

- Shared staging: the base `previews` block points every Preview at staging resources. This is the Cloudflare default. Previews see each other's writes and share migrations.
- Shared production: realistic data, but writes reach production. Only for read-only previews or explicit user choice.
- Empty per-PR: CI creates `<worker>-pr-<number>` resources and deploys with a generated config that overrides `previews.*`.
- Seeded per-PR: like empty per-PR, plus production data copied in.

See `references/resource-strategies.md` and `references/cloudflare-resources.md`.

## Cleanup Rules

On PR close or merge:

- Delete the Preview: `npx wrangler preview delete --name pr-<number> --skip-confirmation` or `npx cf previews delete pr-<number> --worker <worker> --force`.
- Delete per-PR Cloudflare resources only if the selected strategy created them.
- Delete leftover container apps that match `<worker>_<preview-slug>_`, if the Worker uses Containers.
- Mark deployments for that PR's environment inactive.
- Tolerate missing resources. Cleanup must be idempotent.

Canceled outdated deploys should not delete the Preview or per-PR resources. A newer run for the same PR may reuse them.

## Implementation Assets

Adapt names, CLI, package manager, Node version, bindings, and resource commands to the target repo:

- `assets/preview.yml`
- `assets/preview-env.mjs`: native Worker Previews (default)
- `assets/preview-env-separate-worker.mjs`: fallback only

Do not copy templates blindly. Reconcile them with the app's existing scripts, config, bindings, and CI style.

## Migrating Existing Setups

- From this skill's earlier separate-Worker flow: add the `previews` block, swap in the native script, keep the `preview/pr-<number>` environments, and delete leftover `<worker>-pr-<number>` Workers for PRs that are already closed.
- From `versions upload --preview-alias`: these are Version URLs that run against production resources. Replace them with `wrangler preview --name <alias>`.
- From Workers Builds' legacy preview model: the switch to Worker Previews in the dashboard is one-way. Confirm with the user first.

## Verification

After editing the target app:

1. Validate YAML syntax if the repo has a tool for it.
2. Run the repo's lint, typecheck, and tests.
3. Run `npx wrangler preview --name <test-name>` locally if credentials are available, and confirm it warns about no missing bindings. Delete the test Preview afterward.
4. Confirm required GitHub secrets with `gh secret list`.
5. Open or update a PR and verify the PR shows a Deployment with the Preview URL, and the URL serves the PR's code.
6. Close or merge a test PR and verify the Preview, per-PR resources, and container apps are removed and the deployment is inactive.

## After Successful Setup

Only after the target repo has a working preview deployment process, mention any gaps, bugs, ambiguity, missing resource patterns, or reusable improvements discovered while applying this skill. If something would help future users, ask whether the user wants to open an issue or PR on `https://github.com/zeke/preview-deployments-skill`. Do not interrupt setup with this request, and do not ask before the preview flow works.

## Common Bugs To Avoid

- Missing `previews` block, or bindings missing from it. The Preview deploys and then fails at runtime with 1101.
- Pointing `previews` bindings or Queue producers at production by accident.
- No Preview URL because `preview_urls` or `previews_enabled` was never applied with `wrangler deploy`.
- Relying on the branch-name default for the Preview name in CI.
- Running Wrangler older than `4.135.0`, or a global CLI instead of the project's.
- Expecting crons, Queue consumers, Workflows, or service bindings to target the Preview.
- A shared GitHub environment deactivating other open PR previews.
- Cleanup marking every preview inactive instead of only the closed PR's.
- Using PR comments for status instead of the Deployments API.
- Forgetting `deployments: write`.
- Deleting the Preview or per-PR resources from a canceled run while a newer run is starting.
- Assuming fork PRs can access Cloudflare secrets.
- Running Workers Builds Preview Builds and the Actions workflow for the same Worker.

See `references/troubleshooting.md` for diagnosis steps.

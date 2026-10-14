# Troubleshooting

## Deployment Shows Inactive But Preview Is Live

Likely causes:

- All PRs share one GitHub environment named `preview`.
- Cleanup marked every deployment in the preview environment inactive.

Fix:

- Use per-PR environments like `preview/pr-123`.
- On cleanup, list deployments only for that per-PR environment.
- Re-post a `success` status for a still-live deployment only if it matches the current PR head.

## New Commit Still Lets Old Deploy Publish Success

Use both layers:

- Actions `concurrency.cancel-in-progress: true`.
- A script-level SHA check before posting `success`.

If stale, mark the old deployment `inactive` and exit without advertising the URL.

## `wrangler preview` Fails Or Does Something Unexpected

- `Unknown command` or old behavior: the project's Wrangler is older than `4.135.0`. Very old Wrangler had an unrelated `preview` command. Upgrade the project devDependency.
- `Your Wrangler configuration is missing a previews block`: add `"previews": {}` or real Preview bindings. Run `npx wrangler preview --json` to get a `suggested_config`.
- `Cloudflare Build Output was found`: the project builds with `cf`. Use `cf previews deploy`, or delete a leftover `.cloudflare/output`.
- `Could not determine Preview name`: detached checkout with no CI branch variables. Pass `--name pr-<number>`.

## No Preview URL Returned

- workers.dev: set `"preview_urls": true` and run a production `wrangler deploy` so the setting applies.
- Custom domain: the route needs `"previews_enabled": true`, applied with `wrangler deploy`. DNS and certificate provisioning can take minutes after the first Preview.

## Preview Deploys But Requests Fail With 1101

A binding exists at the top level but not in `previews`. Wrangler warns about missing bindings but still deploys. Durable Object `env` bindings and container bindings must be repeated under `previews.durable_objects.bindings`.

## Preview Behaves Like Production Or Touches Production Data

- A `previews` binding points at a production resource ID.
- A service binding: Previews always call the bound Worker's production deployment.
- A Queue producer pointed at a production queue: production consumes the messages.
- A Workflow binding runs the existing deployed Workflow.

## Background Work Never Runs In The Preview

Expected. Cron Triggers and Queue consumers do not target Previews. Call shared logic through a test-only route, or use `references/separate-worker-previews.md`.

## `wrangler tail` Shows Nothing

`wrangler tail` does not support Previews. Use the Preview's Observability tab, `previews.observability`, a Tail Worker in `previews.tail_consumers`, or Logpush.

## Old Previews Disappeared

At 100 Previews (Free) or 500 (Paid) per Worker, Cloudflare deletes the least recently deployed Preview. PR-close cleanup keeps the count down.

## Cleanup Fails Partway Through

Cleanup must be idempotent. A missing Preview, Worker, D1, Queue, or R2 resource should not fail the whole cleanup unless it points to a permissions problem. Tokens scoped to the Worker-level Editor role may not be able to delete. Verify with the actual CI token.

## Leftover Container Apps

`preview delete` can leave the generated `<worker>_<preview-slug>_<Class>` container app behind. Delete only apps matching that full prefix. See `references/cloudflare-resources.md`.

## Fork PRs Do Not Deploy

Expected with `pull_request`: repository secrets are not exposed to forked PRs. Skip the job with `github.event.pull_request.head.repo.full_name == github.repository`. Do not switch to `pull_request_target` casually. It runs with elevated privileges against untrusted PR input unless carefully designed.

## Workflow Change Does Not Affect Its Own PR

GitHub Actions pull request workflows use the base branch workflow definition. Preview workflow changes usually take effect after merging to the base branch and opening or updating another PR.

## Preview URLs Posted Twice

Workers Builds Preview Builds and a GitHub Actions preview workflow are both enabled for the same Worker. Pick one.

## Version URLs Are Not Previews

`wrangler versions upload --preview-alias` creates Version URLs that use production resources. Cloudflare recommends against using them for PR testing. Use `wrangler preview --name <alias>`.

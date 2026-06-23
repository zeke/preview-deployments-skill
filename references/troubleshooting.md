# Troubleshooting

## Deployment Shows Inactive But Worker Is Live

Likely causes:

- All PRs share one GitHub environment named `preview`.
- Cleanup marked every deployment in the preview environment inactive.

Fix:

- Use per-PR environments like `preview/pr-123`.
- On cleanup, list deployments only for that per-PR environment.
- Re-post a `success` status for a still-live deployment only if that matches the current PR head.

## New Commit Still Lets Old Deploy Publish Success

Use both layers:

- Actions `concurrency.cancel-in-progress: true`.
- Script-level SHA guard before posting `success`.

If stale, mark the old deployment `inactive` or `failure` and exit without advertising the URL.

## Fork PRs Do Not Deploy

Expected with `pull_request`: repository secrets are not exposed to forked PRs. Do not switch to `pull_request_target` casually. It runs with elevated privileges against untrusted PR input unless carefully designed.

## Workflow Change Does Not Affect Its Own PR

GitHub Actions pull request workflows use the base branch workflow definition. Preview workflow changes usually take effect after merging to the base branch and opening or updating another PR.

## Cleanup Fails Partway Through

Cleanup must be idempotent. Missing Worker, D1, Queue, or R2 resources should not fail the whole cleanup unless they indicate a real permissions problem.

## Native Workers Preview URLs Are Tempting

Cloudflare has Workers preview URL support, but it may use PR comments, workers.dev-only URLs, and has documented limitations for Workers using Durable Objects. This skill's custom workflow is for cases that need deterministic PR-number subdomains, custom resource setup, GitHub Deployments API status, and teardown.

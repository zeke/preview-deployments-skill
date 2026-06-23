# GitHub Deployments

Use GitHub Deployments to show preview state in the PR UI. Do not use comments for preview status.

## Workflow Permissions

```yaml
permissions:
  contents: read
  deployments: write
```

## Deployment Shape

Create one deployment per preview run:

```js
const deployment = await githubApi(`/repos/${repo}/deployments`, {
  method: "POST",
  body: {
    ref: previewSha,
    auto_merge: false,
    required_contexts: [],
    environment: `preview/pr-${prNumber}`,
    description: `Preview deployment for PR #${prNumber}`,
    transient_environment: true,
    production_environment: false,
  },
});
```

Use the PR head SHA for `ref`. A branch name can work, but a SHA makes each deployment unambiguous.

## Status Shape

```js
await githubApi(`/repos/${repo}/deployments/${deploymentId}/statuses`, {
  method: "POST",
  body: {
    state: "success",
    environment,
    environment_url: previewUrl,
    log_url: actionsRunUrl,
    description: "Preview deployed.",
    auto_inactive: false,
  },
});
```

Use these states:

- `in_progress`: provisioning or deploy started.
- `success`: preview URL is live.
- `failure`: deploy failed.
- `inactive`: preview has been destroyed or superseded.

## Per-PR Environments

Use a per-PR environment such as `preview/pr-123`. Do not use one shared `preview` environment for every PR.

Past failure mode: all PRs used `environment: preview`, and GitHub marked older deployments inactive when a new deployment succeeded in the same environment. That made live previews appear destroyed in PRs.

## Stale Runs

Use Actions concurrency to cancel older jobs when a new commit lands:

```yaml
concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

Also guard before success. If the PR head SHA no longer matches the deployment SHA, do not publish a success status with a live URL. Mark the stale deployment `inactive` or `failure`.

## Cleanup

On PR close, list deployments for that PR's environment and mark them inactive. Do not mark all preview deployments inactive.

```js
const deployments = await githubApi(
  `/repos/${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`,
);
await Promise.allSettled(
  deployments.map((deployment) =>
    createDeploymentStatus(deployment.id, "inactive", "Preview destroyed."),
  ),
);
```

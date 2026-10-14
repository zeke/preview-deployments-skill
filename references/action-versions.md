# GitHub Action Versions

Workflow examples in `assets/` are templates. Before writing a workflow into a target repo, check the latest available action versions at runtime.

## Check Releases

```bash
gh release view actions/checkout --json tagName -q .tagName
gh release view actions/setup-node --json tagName -q .tagName
```

If a repository does not use GitHub Releases, inspect tags:

```bash
gh api repos/actions/checkout/tags --jq '.[0].name'
gh api repos/actions/setup-node/tags --jq '.[0].name'
```

## Policy

- Prefer the latest stable major tag, for example `actions/checkout@v<latest-major>`, when the target repo already uses major tags.
- Use exact version tags or pinned SHAs only when the target repo has that policy.
- Do not downgrade existing action versions.
- If an action is deprecated, replace it with the maintained alternative and document the reason.

## Minimum Actions To Check

Preview workflows commonly use:

- `actions/checkout`
- `actions/setup-node`
- `actions/github-script`, if using inline GitHub API calls instead of a project script
- `cloudflare/wrangler-action`, if the target repo uses it instead of `npx wrangler preview`
- Cloudflare or framework-specific actions already present in the repo

The template uses Node scripts and `npx wrangler` or `npx cf`, so `checkout` and `setup-node` are the baseline checks.

## CLI Versions

Native Worker Previews need project-local CLI versions, not global installs:

```bash
npm view wrangler version
npm view cf version
```

Wrangler must be `4.135.0` or later. Install the latest as a devDependency, and do not downgrade an existing newer version.

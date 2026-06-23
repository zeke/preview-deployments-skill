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
- Cloudflare or framework-specific actions already present in the repo

The template mostly uses Node scripts and `npx wrangler`, so `checkout` and `setup-node` are the baseline checks.

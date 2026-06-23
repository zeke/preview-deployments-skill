# Resource Strategies

Pick one strategy explicitly. Do not infer this silently.

## Shared Production Resources

Preview Worker points at the same D1, R2, KV, AI Gateway, Vectorize, or other bindings as production.

Use when:

- The app is mostly read-only in previews.
- Realistic production data matters more than isolation.
- The user accepts that writes can affect production data.

Rules:

- Document this clearly in the deployment description and project instructions.
- Do not include production routes in preview config.
- Consider disabling write paths or background processors in previews.

Observed example: `tldw` shared production D1/R2/AI so real videos rendered in previews, while container-backed processing was not wired on previews.

## Empty Per-PR Resources

Create separate resources for each PR and leave them empty except migrations or seed fixtures.

Use when:

- Writes must be isolated.
- Real production data is not needed.
- Fast setup matters.

Rules:

- Name resources with `<app>-pr-<number>`.
- Apply migrations after creating D1.
- Delete resources on PR close.

## Seeded Per-PR Resources

Create separate resources for each PR and copy production data into them.

Use when:

- Writes must be isolated.
- Realistic data matters.
- Slower setup is acceptable.

Rules:

- Export production D1, import into preview D1, then apply PR migrations.
- Reuse per-PR resources across synchronize events when that is faster.
- Be explicit that preview data can be overwritten by later deploys.

Observed example: `yogo-api` created per-PR D1 and Queue resources, seeded D1 from production, generated a temporary Wrangler config, and deleted resources on PR close.

## Recommended Default

For apps with user writes or background jobs, prefer seeded per-PR resources when setup time is acceptable. Otherwise prefer empty per-PR resources. Use shared production resources only when previews are read-only or the user explicitly chooses it.

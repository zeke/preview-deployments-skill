# Resource Strategies

Pick one strategy explicitly. Do not infer it silently.

Durable Objects and Containers do not need a strategy with native Worker Previews. Each Preview gets its own namespace automatically. These strategies cover account-level resources: D1, KV, R2, Queue producers, Vectorize, Hyperdrive, Analytics Engine, Pipelines, and similar.

## Shared Staging Resources

The base `previews` block (Wrangler) or `ctx.isPreview` branch (`cf`) points every Preview at one set of staging resources.

Use when:

- Previews need realistic-looking data but must not touch production.
- Previews may see each other's writes.
- Fast setup matters. This is the setup the Cloudflare docs show.

Rules:

- Create staging resources once, outside CI, and commit their IDs in the `previews` block.
- D1 migrations: add `wrangler.preview-migrations.jsonc`, which declares the staging database as a top-level `d1_databases` entry (for example binding `PREVIEW_DB`) with the same `database_name`, `database_id`, and `migrations_dir`. Run `npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc` before `wrangler preview`.
- A PR's migrations run against the shared staging DB and affect every other Preview. If PRs often change schemas, prefer per-PR resources.
- A branch can isolate itself by changing both the `previews` binding and the migrations config to another database.

## Shared Production Resources

The `previews` block points at production resource IDs.

Use when:

- The app is read-only in previews.
- Realistic production data matters more than isolation.
- The user explicitly accepts that writes reach production.

Rules:

- Document this in the deployment description and in the project's AGENTS.md.
- Queue producers pointed at production queues are consumed by production.
- Consider disabling write paths or background work in previews with a `previews.vars` flag.

Observed example: `tldw` shared production D1, R2, and AI so real videos rendered in previews. Container-backed processing was not wired up for previews.

## Empty Per-PR Resources

CI creates resources named `<worker>-pr-<number>` and leaves them empty except for migrations or seed fixtures.

Use when:

- Writes must be isolated per PR.
- Production data is not needed.

Rules:

- Create resources, then generate a config copy that overrides the matching `previews.*` bindings with the new IDs. Write it next to `wrangler.jsonc` (for example `wrangler.preview.generated.jsonc`, gitignored) and pass `--config` to `wrangler preview` and `wrangler d1 migrations apply`.
- `cf` projects: read per-PR IDs from environment variables in the `ctx.isPreview` branch of `cloudflare.config.ts`. Verify that `cf previews deploy` exposes `process.env` to the config module before relying on this.
- Reuse existing resources on `synchronize`. Look up by name before creating.
- Delete resources on PR close, after deleting the Preview.

## Seeded Per-PR Resources

Same as empty per-PR resources, plus a copy of production data.

Use when:

- Writes must be isolated.
- Realistic data matters.
- Slower setup is acceptable.

Rules:

- Export production D1, import into the per-PR D1, then apply the PR's migrations.
- Reseeding on every push overwrites preview data. Decide whether to seed only on creation.

Observed example: `yogo-api` created per-PR D1 and Queue resources, seeded D1 from production, generated a temporary Wrangler config, and deleted the resources on PR close.

## Recommended Default

- Apps with no account-level bindings, or only Durable Objects: no strategy needed. Use an empty `previews` block plus `vars`.
- Most apps with storage: shared staging resources.
- Apps whose PRs often change schemas or run destructive writes: per-PR resources, seeded if realistic data matters.
- Shared production only for read-only previews or explicit user choice.

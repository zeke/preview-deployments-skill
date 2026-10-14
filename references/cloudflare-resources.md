# Cloudflare Resources

Use the project's existing CLI: Wrangler if it has `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml`; `cf` if it has `cloudflare.config.ts` or is new. Verify flags with `npx wrangler <command> --help`, or `npx cf cli search "<task>"` followed by `--help` on the result, before finalizing commands.

## Names

- Preview name: `pr-<number>`.
- Per-PR resources: `<worker>-pr-<number>`.
- GitHub environment: `preview/pr-<number>`.

Native Preview URLs come from command output. See `references/worker-previews.md`.

## Wrangler Config

Add a `previews` block. Start from the production bindings and point each one at a Preview-safe resource:

```jsonc
{
  "name": "my-worker",
  "preview_urls": true,
  "vars": { "ENVIRONMENT": "production" },
  "d1_databases": [{ "binding": "DB", "database_name": "my-worker", "database_id": "<prod-id>" }],
  "previews": {
    "vars": { "ENVIRONMENT": "preview" },
    "d1_databases": [{ "binding": "DB", "database_name": "my-worker-staging", "database_id": "<staging-id>" }]
  }
}
```

Never add routes, Cron Triggers, or Queue consumers to `previews`.

For per-PR resources, generate a config copy in CI that replaces IDs inside `previews.*`. Use a JSONC-aware parser such as `jsonc-parser`. Do not strip comments with regex.

## D1

Seeded per-PR flow (Wrangler):

```bash
npx wrangler d1 create <worker>-pr-123
npx wrangler d1 export <production-db-name> --remote --output production.sql
npx wrangler d1 execute <worker>-pr-123 --remote --file production.sql
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.generated.jsonc
```

`d1 migrations apply` targets a top-level binding, so the migrations config declares the Preview database at the top level. See the shared staging rules in `references/resource-strategies.md`.

Cleanup:

```bash
npx wrangler d1 delete <worker>-pr-123 --skip-confirmation
```

Parse the database ID from `wrangler d1 list --json`.

## Queues

Previews can only produce. Point `previews.queues.producers` at a non-production queue. Nothing consumes from a Preview, so do not expect a per-PR consumer. If the PR must test consumers, use `references/separate-worker-previews.md`.

## R2

Use per-PR buckets only when previews need isolated object writes. Empty buckets before deleting them, using paginated listing and bounded parallel deletes.

## KV, Vectorize, Hyperdrive, Workflows, AI, Browser

- KV: shared staging namespace by default. Per-PR namespaces only when writes need isolation.
- Vectorize: create the index before deploying. Prefer a shared read-only index.
- Hyperdrive: real isolation needs a separate config pointing at a separate database or schema. Ask before cloning backing databases.
- Workflows: bind to an existing non-production Workflow. Previews do not create Workflows.
- AI, Browser, Images, and similar API bindings: repeat them under `previews` if code reads them from `env`. They do not need resources.

## Durable Objects And Containers

Isolated automatically for each Preview. Keep classes and migrations at the top level. Repeat `env` bindings under `previews.durable_objects.bindings`, and containers under `previews.containers`.

After `preview delete`, check for leftover container apps:

```bash
npx wrangler containers list --json \
  | jq -r --arg prefix "<worker>_pr-123_" '.[] | select(.name | startswith($prefix)) | .id'
```

Delete only IDs matching the full `<worker>_<preview-slug>_` prefix.

## Secrets

GitHub repository secrets:

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID"
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN"
```

App secrets for Previews, in order of preference:

1. Previews Base config: `npx wrangler preview base-config secret put NAME`. Set once, outside CI. Applies only to Previews created afterward.
2. `--secrets-file` on `wrangler preview`, built in CI from `secrets.*` in `$RUNNER_TEMP`. Never print it.
3. A secret for one Preview: `npx wrangler preview secret put NAME --name pr-123`.

Never hardcode secrets in source or config.

# Cloudflare Resources

Use Wrangler where practical. Verify current command flags from docs or `npx wrangler <command> --help` before finalizing commands.

## Worker Names

Use deterministic per-PR names:

```text
<app>-pr-<number>
```

Preview URL:

```text
https://<app>-pr-<number>.<workers-subdomain>.workers.dev
```

## Wrangler Config

For shared resources, a committed `wrangler.preview.jsonc` can be enough if it mirrors production but removes routes.

For per-PR resources, generate a temporary config during CI after resource creation so it can include fresh IDs.

Always remove production `routes` from preview config. Preview Workers should not claim canonical production domains.

## D1

Common flow for seeded per-PR D1:

```bash
npx wrangler d1 create <app>-pr-123
npx wrangler d1 export <production-db-name> --remote --output production.sql
npx wrangler d1 execute <app>-pr-123 --remote --file production.sql
npx wrangler d1 migrations apply DB --remote --config /tmp/wrangler.preview.jsonc
```

Common cleanup:

```bash
npx wrangler d1 delete <app>-pr-123 --skip-confirmation
```

Parse the database ID from `wrangler d1 create` output or read it from `wrangler d1 list --json`.

## Queues

Create a per-PR queue when the app has a Queue binding:

```bash
npx wrangler queues create <app>-pr-123-seed
```

Cleanup should remove consumers before deleting queues when needed. Tolerate missing resources and prompts by using documented non-interactive flags or piping confirmation only after verifying current Wrangler behavior.

## R2

Use per-PR R2 buckets only when previews need isolated object writes.

Cleanup must empty buckets before deletion. Large buckets need paginated object listing and bounded parallel deletes.

## KV, Vectorize, Hyperdrive, AI, Browser, Durable Objects

- KV: create per-PR namespaces only when writes need isolation.
- Vectorize: prefer shared read-only unless tests require isolated indexes.
- Hyperdrive: often points to existing databases. Ask before sharing or cloning backing databases.
- AI and Browser bindings usually do not need per-PR resource creation.
- Durable Objects are isolated by Worker script name. Per-PR Workers usually get separate DO namespaces for the same class bindings.

## Secrets

Use GitHub repository secrets and Wrangler secrets files. Do not hardcode secrets in source or config.

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID"
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN"
```

When a preview Worker needs app secrets, pass them through GitHub Actions `secrets.*` and deploy using a secrets file when appropriate. Avoid printing secret values.

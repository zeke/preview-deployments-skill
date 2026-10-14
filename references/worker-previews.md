# Worker Previews

Worker Previews is Cloudflare's native preview environment feature, in open beta since 2026-09-22. Each Preview is an isolated environment under one existing Worker, with its own code, settings, URL, observability, and Durable Object state. It is not a separate Worker.

Docs: https://developers.cloudflare.com/workers/previews/

Re-verify this page against the docs and `--help` output before relying on it. The feature is in beta and changes often.

## Requirements

- Wrangler projects: Wrangler `4.135.0` or later as a project devDependency. `cloudflare/wrangler-action` asks for `4.136.3` or later. Project commands do not use a newer global install.
- `cf` projects: `cf` as a project devDependency, at the latest release. `cf previews delete` is missing from older betas (for example `1.0.0-beta.12`). `cf previews deploy` needs Wrangler `4.136.0` or later installed in the project.
- A `previews` block in the Wrangler config (it can be empty), or a `ctx.isPreview` branch in `cloudflare.config.ts`.

## Commands

| Task                         | Wrangler project                                                   | `cf` project                                                  |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Create or update a Preview   | `npx wrangler preview --name pr-123`                               | `npx cf previews deploy pr-123`                               |
| Delete a Preview             | `npx wrangler preview delete --name pr-123 --skip-confirmation`    | `npx cf previews delete pr-123 --worker <worker> --force`     |
| Base config secret           | `npx wrangler preview base-config secret put NAME`                 | No `cf` equivalent found. Verify, then use the Wrangler command |
| Secret for one Preview       | `npx wrangler preview secret put NAME --name pr-123`               | No `cf` equivalent found. Verify, then use the Wrangler command |
| Secrets uploaded with a deploy | `npx wrangler preview --secrets-file <file>`                     | Verify with `npx cf previews deploy --help`                   |

The Preview name defaults to the current branch (`GITHUB_HEAD_REF` in Actions). Always pass an explicit name such as `pr-<number>` in CI. Branch names can contain slashes and change when branches are renamed.

`--env <name>` targets Previews under a Wrangler environment Worker. Pass the same `--env` to every Preview command, including delete.

## Machine-Readable Output

Wrangler appends an NDJSON entry to the file named by `WRANGLER_OUTPUT_FILE_PATH`:

```json
{
  "type": "preview",
  "version": 1,
  "worker_name": "my-worker",
  "preview_id": "...",
  "preview_name": "pr-123",
  "preview_slug": "pr-123",
  "preview_urls": ["https://pr-123-my-worker.example.workers.dev"],
  "deployment_id": "...",
  "deployment_urls": ["https://<id>-my-worker.example.workers.dev"]
}
```

`wrangler preview --json` prints `{ "preview": ..., "deployment": ... }` to stdout instead. `cf previews deploy` prints JSON with the same fields as the output-file entry.

Read URLs from this output. Do not build Preview URLs from the workers.dev subdomain.

`wrangler preview --json` without a `previews` block fails with a `suggested_config` object. Use it as a starting point, and replace every `<REPLACE_ME>` with a Preview-safe value.

## URLs

| Host          | Preview URL (follows latest deploy)                 | Deployment URL (fixed to one deploy)                 |
| ------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `workers.dev` | `<preview>-<worker>.<subdomain>.workers.dev`        | `<deployment-id>-<worker>.<subdomain>.workers.dev`   |
| Custom domain | `<preview>.app.example.com`                         | `<deployment-id>-<preview>.app.example.com`          |

- workers.dev Preview URLs need `"preview_urls": true`. That setting takes effect on `wrangler deploy` (production), not on `wrangler preview`. If it is omitted, Wrangler keeps the existing setting. A Worker first created by `wrangler preview` uses `preview_urls`, falling back to `workers_dev`.
- Custom domain Preview URLs need a route with `"custom_domain": true, "previews_enabled": true`. Set `"enabled": false` for Preview-only traffic. Run `wrangler deploy` once to publish the route. Cloudflare provisions a wildcard DNS record and certificate, which can take a few minutes. Use a dedicated hostname such as `previews.example.com` to avoid wildcard conflicts.
- workers.dev Preview responses include `X-Robots-Tag: noindex`. Custom domain Preview URLs do not.
- Preview URLs are public by default. Use Cloudflare Access to protect them.
- Keep `<preview>-<worker>` within the 63-character DNS label limit. I have not verified how Cloudflare handles longer names, so check before using long Worker names.

Use custom domain Preview URLs when OAuth redirects, cookies, or CORS need production-like hostnames.

## Configuration

Previews inherit nothing from top-level production settings except the items below.

| Setting                                         | Where it goes                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `assets`, `compatibility_date`, `compatibility_flags`, DO/container `migrations` | Top level only                                     |
| `placement`                                     | Top level applies. `previews.placement` overrides                                      |
| `observability`, `logpush`, `limits`            | Optional `previews.*` overrides                                                        |
| `vars`, `define`, `tail_consumers`              | Must be repeated in `previews`                                                         |
| KV, D1, R2, Hyperdrive, Vectorize, Analytics Engine, Pipelines, Secrets Store, Queue producers | Must be repeated in `previews`, pointed at Preview-safe resources |
| Durable Object `env` bindings                   | Repeat in `previews.durable_objects.bindings`. Not needed with `ctx.exports`           |
| Containers                                      | Repeat in `previews.containers`                                                        |
| `ai`, `browser`, `images`, `stream`, `media`, `worker_loaders`, `version_metadata` | Repeat in `previews` if code reads them from `env` |
| Queue consumers, Cron Triggers, production routes | Never in `previews`. They do not target Previews                                     |

If a binding is missing from `previews`, the Preview still deploys and Wrangler prints a warning. Code that reads the binding then fails at runtime, often with error 1101.

`cf` projects: `cf migrate` turns a `previews` block into a `ctx.isPreview` branch in a function-form `cloudflare.config.ts`. The function returns one complete config per mode, and nothing is merged.

Dashboard "Previews Base" settings must be copied back into the Wrangler file. Prefer editing the file directly.

## Secrets

Secrets cannot live in config. Options:

- Base config secrets: copied into each new Preview when it is created. Later changes apply only to new Previews.
- Secrets for one Preview: override the base for one Preview.
- `--secrets-file` on `wrangler preview`: uploads secrets with each deployment. Use this in CI when secrets come from GitHub Actions `secrets.*`. Write the file to `$RUNNER_TEMP` and never print it.

## Isolation

- Durable Objects: each Preview gets a new namespace and storage automatically. State persists across deploys of that Preview and is deleted with it.
- Containers: each Preview gets its own container app (`<worker>_<preview-slug>_<Class>`). Wrangler support is partial. The `cf` docs say Previews do not support Durable Object-managed Containers. `preview delete` can leave the container app behind, so clean it up by matching the full `<worker>_<preview-slug>_` prefix, never by Worker name alone.
- Everything else: shared if two Previews bind the same resource ID or name.

## Limitations

- Service bindings call the bound Worker's production deployment, not a matching Preview. Use `ctx.exports` for same-Worker calls.
- Workflow bindings use an existing deployed Workflow. Previews do not create Workflows.
- Previews can produce to Queues but cannot consume. Messages sent to a production queue are consumed by production.
- Cron Triggers never run on Previews. Expose scheduled logic behind a test-only route if it needs testing.
- `wrangler tail` does not support Previews. Use per-Preview Workers Observability, Tail Workers, or Logpush.
- Limits: 100 Previews per Worker on Free, 500 on Paid, 100 deployments per Preview. At the limit, Cloudflare deletes the least recently deployed Preview, or the oldest deployment.

If one of these blocks the app, use the separate-Worker fallback in `references/separate-worker-previews.md`.

## Observability

- Enable logs and traces under `previews.observability` without changing production sampling.
- The dashboard shows each Preview's Observability and Metrics tabs through the environment breadcrumb next to the Worker name.
- GraphQL: query `workersInvocationsAdaptive` with `isPreview: 1`, and group by `previewSlug`.

## Workers Builds

Workers Builds is Cloudflare's Git integration. With Preview Builds enabled, it runs `npx wrangler preview` for every non-production branch push. It posts a PR comment with the Preview URL and creates GitHub check runs. It does not create GitHub Deployments.

- New Workers use Worker Previews for Preview Builds by default.
- Existing Workers connected to Builds need a one-time dashboard switch. It cannot be undone.
- A custom Preview command must still invoke `wrangler preview`. Setting it to `wrangler versions upload` creates Version URLs instead.
- The docs do not describe PR-close teardown. Previews stay until the Preview limit evicts them, unless a separate cleanup job deletes them.
- Do not run Workers Builds Preview Builds and a GitHub Actions preview workflow for the same Worker. Both would deploy the same Preview.

## Related Features

- Version URLs (`wrangler versions upload --preview-alias`) run one uploaded version against production resources. Cloudflare says not to use them for branch or PR testing. Migrate them to `wrangler preview --name <alias>`.
- Wrangler environments create separate Workers. Previews can live under one, for example `npx wrangler preview --env staging` with `env.staging.previews`.
- `cloudflare/wrangler-action@v4` runs `preview` and, with `gitHubToken`, posts one `success` GitHub Deployment. Its environment is the Preview name and its `ref` is the branch. It sets no `in_progress`, `failure`, or `inactive` status and no `transient_environment`, has no stale-run guard, and does not clean up.

## API Tokens

The token needs Workers Scripts edit access plus access to any resources the Preview binds or CI creates. Worker-level roles (Metadata Read-Only, Content Read-Only, Editor, Admin) exist. Editor cannot delete the Worker. Whether Editor can delete Previews is not documented, so verify cleanup with the actual CI token.

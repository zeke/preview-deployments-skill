# Separate-Worker Previews (Fallback)

Before Worker Previews, this skill deployed a full, separately named Worker for each PR (`<worker>-pr-<number>`) with `wrangler deploy --name`, then deleted it when the PR closed. Use this approach only when native Worker Previews cannot support the app.

## When To Use It

- A PR needs its own Queue consumer, for example a per-PR queue whose consumer runs the PR's code.
- A PR needs its own Workflow, or Cron Triggers that run on the preview.
- Service bindings must reach per-PR copies of sibling Workers instead of production.
- The project cannot move to Wrangler `4.135.0` or later yet.

State the reason explicitly when choosing this fallback. Re-check `references/worker-previews.md` first, because Cloudflare plans to add multi-Worker, Queue consumer, and Workflow support to Previews.

## Costs Compared To Native Previews

- Each PR is a full Worker in the account. Each one counts toward account Worker limits, appears in the Workers list, and has its own settings.
- Preview Workers do not appear in the parent Worker's Previews view.
- Secrets must be set on each preview Worker, for example with `wrangler deploy --secrets-file`.
- The generated config must strip production triggers. Native Previews ignore these automatically.

## Rules

- Name: `<worker>-pr-<number>`. URL: `https://<worker>-pr-<number>.<workers-subdomain>.workers.dev`. Infer the subdomain from existing workers.dev URLs, or ask.
- Generate a temporary config for each run. Write it next to `wrangler.jsonc` and gitignore it, so relative `main` and `assets` paths still resolve.
- In the generated config:
  - Remove `routes`, `route`, and custom domains.
  - Remove `triggers.crons`, unless the PR is meant to test crons.
  - Remove Queue consumers, or point them at a per-PR queue. A queue can have only one consumer.
  - Point service bindings at per-PR sibling Workers only if those Workers are also deployed for the PR.
  - Durable Objects are isolated by script name, so each preview Worker gets separate namespaces.
- Destroy with `wrangler delete --name <worker>-pr-<number>`, tolerating missing Workers.

## Template

Use `assets/preview-env-separate-worker.mjs` with `assets/preview.yml`. The GitHub Deployments lifecycle is the same as for native Previews.

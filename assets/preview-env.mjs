/* global fetch, process */

// Native Worker Previews: one Preview per PR under the existing Worker.
// See references/worker-previews.md.

import { spawn } from "node:child_process";
import { appendFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// "wrangler" for projects with wrangler.jsonc/json/toml, "cf" for projects
// with cloudflare.config.ts.
const cli = "wrangler";
// Required by `cf previews delete`. Must match the Worker name in config.
const workerName = "YOUR_WORKER";
// Optional generated Wrangler config for per-PR resources, written next to
// wrangler.jsonc so relative paths resolve. Leave undefined otherwise.
const wranglerConfig = undefined;

const action = process.argv[2];
const prNumber = requiredEnv("PREVIEW_PR_NUMBER");
const previewSha = requiredEnv("PREVIEW_SHA");
const repo = requiredEnv("GITHUB_REPOSITORY");
const githubToken = requiredEnv("GITHUB_TOKEN");
const githubRunId = requiredEnv("GITHUB_RUN_ID");
const githubServerUrl = process.env.GITHUB_SERVER_URL || "https://github.com";

requiredEnv("CLOUDFLARE_ACCOUNT_ID");
requiredEnv("CLOUDFLARE_API_TOKEN");

const previewName = `pr-${prNumber}`;
const environment = `preview/pr-${prNumber}`;
const logUrl = `${githubServerUrl}/${repo}/actions/runs/${githubRunId}`;
const configArgs = wranglerConfig ? ["--config", wranglerConfig] : [];

if (action === "deploy") {
  await deploy();
} else if (action === "destroy") {
  await destroy();
} else {
  throw new Error("Usage: node scripts/preview-env.mjs <deploy|destroy>");
}

async function deploy() {
  const deployment = await createDeployment();
  await createDeploymentStatus(deployment.id, "in_progress", "Creating preview.");

  try {
    // Adapt this section for the app's resource strategy.
    // Shared staging or shared production: nothing to do here, the committed
    // `previews` block already points at the right resources. Apply staging D1
    // migrations before deploying if the PR adds any.
    // Per-PR resources: create or look up `<worker>-pr-<number>` resources,
    // write the generated config, and run migrations against it.
    const result = await deployPreview();
    const previewUrl = result.preview_urls?.[0];
    const deploymentUrl = result.deployment_urls?.[0];

    if (!previewUrl) {
      throw new Error(
        "No Preview URL returned. Set preview_urls: true (or a custom domain with previews_enabled) and run a production deploy once.",
      );
    }

    if (!(await isCurrentPullRequestHead())) {
      await createDeploymentStatus(deployment.id, "inactive", "Superseded by a newer commit.");
      return;
    }

    await createDeploymentStatus(deployment.id, "success", "Preview deployed.", {
      environmentUrl: previewUrl,
    });
    await markDeploymentsInactive(deployment.id);
    await writeJobSummary(previewUrl, deploymentUrl);
  } catch (error) {
    await createDeploymentStatus(deployment.id, "failure", "Preview deployment failed.");
    throw error;
  }
}

async function destroy() {
  // Delete per-PR resources here too, after the Preview, if the selected
  // strategy created them. Tolerate missing resources.
  const deleteArgs =
    cli === "cf"
      ? ["cf", "previews", "delete", previewName, "--worker", workerName, "--force"]
      : ["wrangler", "preview", "delete", "--name", previewName, "--skip-confirmation", ...configArgs];

  const results = await Promise.allSettled([
    run("npx", deleteArgs, { allowFailure: true }),
    markDeploymentsInactive(),
  ]);

  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

async function deployPreview() {
  if (cli === "cf") {
    const { stdout } = await run("npx", ["cf", "previews", "deploy", previewName]);
    // cf prints the result as JSON. Parse the last top-level object in case
    // build logs precede it.
    const start = stdout.startsWith("{") ? 0 : stdout.lastIndexOf("\n{") + 1;
    return JSON.parse(stdout.slice(start));
  }

  const outputFile = join(process.env.RUNNER_TEMP || tmpdir(), `wrangler-output-${process.pid}.ndjson`);
  try {
    await run("npx", ["wrangler", "preview", "--name", previewName, ...configArgs], {
      env: { WRANGLER_OUTPUT_FILE_PATH: outputFile },
    });
    const entries = (await readFile(outputFile, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const entry = entries.findLast((item) => item.type === "preview");
    if (!entry) throw new Error("wrangler preview did not write a preview output entry.");
    return entry;
  } finally {
    await rm(outputFile, { force: true });
  }
}

async function writeJobSummary(previewUrl, deploymentUrl) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### Preview \`${previewName}\``,
      "",
      `- Preview URL (latest): ${previewUrl}`,
      deploymentUrl ? `- Deployment URL (${previewSha.slice(0, 7)}): ${deploymentUrl}` : "",
      "",
    ].join("\n"),
  );
}

async function createDeployment() {
  return githubApi(`/repos/${repo}/deployments`, {
    method: "POST",
    body: {
      ref: previewSha,
      auto_merge: false,
      required_contexts: [],
      environment,
      description: `Preview deployment for PR #${prNumber}`,
      transient_environment: true,
      production_environment: false,
    },
  });
}

async function createDeploymentStatus(deploymentId, state, description, options = {}) {
  return githubApi(`/repos/${repo}/deployments/${deploymentId}/statuses`, {
    method: "POST",
    body: {
      state,
      environment,
      description,
      log_url: logUrl,
      environment_url: options.environmentUrl || "",
      auto_inactive: false,
    },
  });
}

async function markDeploymentsInactive(excludeDeploymentId) {
  const deployments = await githubApi(
    `/repos/${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`,
  );

  await Promise.allSettled(
    deployments
      .filter((deployment) => deployment.id !== excludeDeploymentId)
      .map((deployment) => createDeploymentStatus(deployment.id, "inactive", "Preview destroyed.")),
  );
}

async function isCurrentPullRequestHead() {
  const pull = await githubApi(`/repos/${repo}/pulls/${prNumber}`);
  return pull.head?.sha === previewSha;
}

async function githubApi(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return undefined;
  return response.json();
}

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      // On pull_request events GITHUB_SHA is the merge commit. Wrangler records
      // it as the Preview deployment's commit, so pass the PR head instead.
      env: { ...process.env, GITHUB_SHA: previewSha, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        if (code !== 0) console.warn(`${command} ${args.join(" ")} exited with ${code}; continuing.`);
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/* global fetch, process */

import { spawn } from "node:child_process";

const appName = "YOUR_APP";
const workersSubdomain = "YOUR_SUBDOMAIN";

const action = process.argv[2];
const prNumber = requiredEnv("PREVIEW_PR_NUMBER");
const previewSha = requiredEnv("PREVIEW_SHA");
const repo = requiredEnv("GITHUB_REPOSITORY");
const githubToken = requiredEnv("GITHUB_TOKEN");
const githubRunId = requiredEnv("GITHUB_RUN_ID");
const githubServerUrl = process.env.GITHUB_SERVER_URL || "https://github.com";

requiredEnv("CLOUDFLARE_ACCOUNT_ID");
requiredEnv("CLOUDFLARE_API_TOKEN");

const workerName = `${appName}-pr-${prNumber}`;
const environment = `preview/pr-${prNumber}`;
const environmentUrl = `https://${workerName}.${workersSubdomain}.workers.dev`;
const logUrl = `${githubServerUrl}/${repo}/actions/runs/${githubRunId}`;

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
    // Examples: create per-PR D1/Queue/R2, generate temp wrangler config,
    // export/import D1, run migrations, or use a committed shared preview config.
    await wrangler(["deploy", "--name", workerName]);

    if (!(await isCurrentPullRequestHead())) {
      await createDeploymentStatus(deployment.id, "inactive", "Superseded by a newer commit.");
      return;
    }

    await createDeploymentStatus(deployment.id, "success", "Preview deployed.", {
      environmentUrl,
    });
    await markDeploymentsInactive(deployment.id);
  } catch (error) {
    await createDeploymentStatus(deployment.id, "failure", "Preview deployment failed.");
    throw error;
  }
}

async function destroy() {
  const results = await Promise.allSettled([
    wrangler(["delete", "--name", workerName], { allowFailure: true, input: "y\n" }),
    markDeploymentsInactive(),
  ]);

  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
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

async function wrangler(args, options = {}) {
  return run("npx", ["wrangler", ...args], options);
}

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"],
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
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });

    if (options.input) child.stdin.end(options.input);
  });
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

#!/usr/bin/env node
"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const workflow = process.argv[2];

if (!workflow) {
  console.error("usage: node tools/run-agent-ci.cjs <workflow-path>");
  process.exit(2);
}

if (!process.env.AGENT_CI_DOCKER_HOST && !existsSync("/var/run/docker.sock")) {
  console.error(
    [
      "AgentCI requires a reachable Docker daemon.",
      "Expected /var/run/docker.sock, or set AGENT_CI_DOCKER_HOST to a supported Docker host.",
      "For Docker Desktop on WSL, enable this distro's WSL integration so /var/run/docker.sock exists.",
    ].join("\n"),
  );
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "dlx",
    "@redwoodjs/agent-ci@latest",
    "run",
    "--workflow",
    workflow,
    "--quiet",
    "--pause-on-failure",
  ],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);

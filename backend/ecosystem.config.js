"use strict";

const os = require("os");
const path = require("path");

/**
 * PM2 process file for a small VM (846 MB RAM).
 * Caps Node heaps so solar + WiFi cannot silently grow until the kernel OOM-kills.
 * Does not change app logic — only restart/memory guards.
 *
 * Script paths default to the home directory of the user who starts PM2,
 * which is where backend_api.js is installed. Override with DEPLOY_HOME
 * or BACKEND_SCRIPT / ONT_WORKER_SCRIPT. See .env.example.
 */
const deployHome = process.env.DEPLOY_HOME || os.homedir();

module.exports = {
  apps: [
    {
      name: "backend_api",
      script: process.env.BACKEND_SCRIPT || path.join(deployHome, "backend_api.js"),
      cwd: process.env.BACKEND_CWD || deployHome,
      interpreter: "node",
      node_args: "--max-old-space-size=256",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "300M",
      exp_backoff_restart_delay: 2000,
      max_restarts: 20,
      min_uptime: "10s",
      kill_timeout: 8000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=256",
      },
    },
    {
      name: "ont-worker",
      script: process.env.ONT_WORKER_SCRIPT || path.join(deployHome, "acs-worker", "index.js"),
      cwd: process.env.ONT_WORKER_CWD || deployHome,
      interpreter: "node",
      node_args: "--max-old-space-size=160",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "150M",
      exp_backoff_restart_delay: 2000,
      max_restarts: 20,
      min_uptime: "10s",
      kill_timeout: 8000,
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=160",
      },
    },
  ],
};

"use strict";

/**
 * PM2 process file for the Azure VM (846 MB RAM).
 * Caps Node heaps so solar + WiFi cannot silently grow until the kernel OOM-kills.
 * Does not change app logic — only restart/memory guards.
 */
module.exports = {
  apps: [
    {
      name: "backend_api",
      script: "/home/azureuser/backend_api.js",
      cwd: "/home/azureuser",
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
      script: "/home/azureuser/acs-worker/index.js",
      cwd: "/home/azureuser",
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

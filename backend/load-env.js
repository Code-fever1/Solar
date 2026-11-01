"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Fill unset environment variables from .env files.
 * Existing variables win, so a shell or PM2 env keeps the same behaviour.
 * Values are kept whole, including '#', so device keys are not truncated.
 */
function loadEnvFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key]) continue;
    let value = body.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function defaultEnvPaths() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(process.cwd(), "..", ".env"),
  ];
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}

function loadEnv() {
  for (const filePath of defaultEnvPaths()) loadEnvFile(filePath);
}

loadEnv();

module.exports = { loadEnv, loadEnvFile };

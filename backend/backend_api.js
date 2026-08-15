const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const app = express();
app.use(cors());
app.use(express.json());

const mongoUrl = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGO_DB || "ont_monitor";
const port = Number(process.env.PORT || 3001);
const client = new MongoClient(mongoUrl);
const MODEM_TIMEOUT_MS = Number(process.env.MODEM_TIMEOUT_MS || 15_000);
const HUAWEI_LANGUAGE = "english";
const FILTER_STATUS_VALUES = new Set(["pending", "synced", "failed"]);
const FILTER_CHANNEL_VALUES = new Set(["wired", "wifi"]);
const PORT_FLAP_INTENSITIES = new Set(["very_light", "light", "medium", "hard"]);
const PORT_FLAP_LAN_PORTS = new Set(["1", "2", "3", "4"]);
const PORT_FLAP_WLAN_PORTS = new Set(["1", "2", "5", "6"]);
const PORT_FLAP_AUTO_STATUSES = new Set(["online", "offline"]);
const AUTOMATION_ACTION_TYPES = new Set(["start_instability", "stop_instability", "set_ports"]);
const processStartedAt = Date.now();

function cleanString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanBoolean(value, fallback = null) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function normalizeMac(value) {
  return cleanString(value)?.toLowerCase() || null;
}

function isMacAddress(value) {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(String(value || "").trim());
}

function normalizeMacList(values) {
  const items = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const list = [];
  for (const item of items) {
    const mac = normalizeMac(item);
    if (!mac || seen.has(mac) || !isMacAddress(mac)) continue;
    seen.add(mac);
    list.push(mac);
  }
  return list;
}

function cleanFilterSyncStatus(value, fallback = null) {
  const normalized = cleanString(value)?.toLowerCase() || null;
  return normalized && FILTER_STATUS_VALUES.has(normalized) ? normalized : fallback;
}

function cleanFilterChannel(value, fallback = null) {
  const normalized = cleanString(value)?.toLowerCase() || null;
  return normalized && FILTER_CHANNEL_VALUES.has(normalized) ? normalized : fallback;
}

function cleanPortFlapIntensity(value, fallback = "light") {
  const normalized = cleanString(value)?.toLowerCase().replace(/[\s-]+/g, "_") || null;
  return normalized && PORT_FLAP_INTENSITIES.has(normalized) ? normalized : fallback;
}

function normalizePortFlapTargets(value) {
  const raw = value && typeof value === "object" ? value : {};
  const readList = (items, allowed) => {
    const seen = new Set();
    const list = [];
    for (const item of Array.isArray(items) ? items : []) {
      const token = cleanString(item);
      if (!token || !allowed.has(token) || seen.has(token)) continue;
      seen.add(token);
      list.push(token);
    }
    return list;
  };

  return {
    lan: readList(raw.lan, PORT_FLAP_LAN_PORTS),
    wlan: readList(raw.wlan, PORT_FLAP_WLAN_PORTS),
  };
}

function portFlapTargetLabel(kind, port) {
  if (kind === "lan") return `LAN ${port}`;
  return (
    {
      "1": "WiFi 2.4 GHz",
      "5": "WiFi 5 GHz",
      "2": "Guest WiFi 2.4 GHz",
      "6": "Guest WiFi 5 GHz",
    }[port] || `WLAN ${port}`
  );
}

function normalizePortFlapAutoConditions(value) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(value) ? value : []) {
    const raw = item && typeof item === "object" ? item : {};
    const kind = cleanString(raw.kind)?.toLowerCase();
    const port = cleanString(raw.port);
    const status = cleanString(raw.status)?.toLowerCase();
    const allowedPorts = kind === "lan" ? PORT_FLAP_LAN_PORTS : kind === "wlan" ? PORT_FLAP_WLAN_PORTS : null;
    if (!allowedPorts || !port || !allowedPorts.has(port) || !status || !PORT_FLAP_AUTO_STATUSES.has(status)) {
      continue;
    }
    const key = `${kind}:${port}:${status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      kind,
      port,
      status,
      key,
      label: portFlapTargetLabel(kind, port),
    });
  }
  return list;
}

function makeAutomationId(prefix, index) {
  return `${prefix}_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanAutomationId(value, fallback) {
  const raw = cleanString(value);
  if (!raw) return fallback;
  const normalized = raw.replace(/[^\w:-]/g, "").slice(0, 80);
  return normalized || fallback;
}

function normalizeAutomationCondition(value) {
  const raw = value && typeof value === "object" ? value : {};
  const kind = cleanString(raw.kind)?.toLowerCase();
  const port = cleanString(raw.port);
  const status = cleanString(raw.status)?.toLowerCase();
  const allowedPorts = kind === "lan" ? PORT_FLAP_LAN_PORTS : kind === "wlan" ? PORT_FLAP_WLAN_PORTS : null;
  if (!allowedPorts || !port || !allowedPorts.has(port) || !status || !PORT_FLAP_AUTO_STATUSES.has(status)) {
    return null;
  }
  return {
    kind,
    port,
    status,
    key: `${kind}:${port}:${status}`,
    label: portFlapTargetLabel(kind, port),
  };
}

function normalizeAutomationGroups(value) {
  const groups = [];
  for (const item of Array.isArray(value) ? value : []) {
    const rawGroup = Array.isArray(item) ? { conditions: item } : item && typeof item === "object" ? item : {};
    const seen = new Set();
    const conditions = [];
    for (const condition of Array.isArray(rawGroup.conditions) ? rawGroup.conditions : []) {
      const normalized = normalizeAutomationCondition(condition);
      if (!normalized || seen.has(normalized.key)) continue;
      seen.add(normalized.key);
      conditions.push(normalized);
    }
    if (conditions.length === 0) continue;
    groups.push({
      id: cleanAutomationId(rawGroup.id, `group_${groups.length + 1}`),
      conditions,
    });
  }
  return groups;
}

function normalizeAutomationAction(value, index = 0) {
  const raw = value && typeof value === "object" ? value : {};
  const type = cleanString(raw.type)?.toLowerCase();
  if (!type || !AUTOMATION_ACTION_TYPES.has(type)) return null;

  if (type === "stop_instability") {
    return {
      id: cleanAutomationId(raw.id, `action_${index + 1}`),
      type,
      targets: { lan: [], wlan: [] },
    };
  }

  const targets = normalizePortFlapTargets(raw.targets);
  if (!hasPortFlapTargets(targets)) return null;

  if (type === "set_ports") {
    const enabled = cleanBoolean(raw.enabled, null);
    if (enabled == null) return null;
    return {
      id: cleanAutomationId(raw.id, `action_${index + 1}`),
      type,
      targets,
      enabled,
    };
  }

  return {
    id: cleanAutomationId(raw.id, `action_${index + 1}`),
    type,
    targets,
  };
}

function normalizeAutomationRules(value, options = {}) {
  const existingById = new Map(
    (Array.isArray(options.existingRules) ? options.existingRules : [])
      .map((rule) => [cleanString(rule?.id), rule])
      .filter(([id]) => Boolean(id)),
  );
  const rules = [];
  for (const item of Array.isArray(value) ? value : []) {
    const raw = item && typeof item === "object" ? item : {};
    const id = cleanAutomationId(raw.id, makeAutomationId("rule", rules.length + 1));
    const groups = normalizeAutomationGroups(raw.groups);
    const actions = (Array.isArray(raw.actions) ? raw.actions : [])
      .map((action, index) => normalizeAutomationAction(action, index))
      .filter(Boolean);
    if (groups.length === 0 || actions.length === 0) continue;

    const previous = existingById.get(id) || {};
    const lastResult =
      options.resetRuntime
        ? { matched: false, checked_at: null }
        : previous.last_result && typeof previous.last_result === "object"
          ? previous.last_result
          : raw.last_result && typeof raw.last_result === "object"
            ? raw.last_result
            : { matched: false, checked_at: null };

    rules.push({
      id,
      name: cleanString(raw.name) || `Rule ${rules.length + 1}`,
      enabled: cleanBoolean(raw.enabled, true),
      priority: rules.length,
      groups,
      actions,
      last_result: {
        matched: Boolean(lastResult.matched),
        checked_at: normalizeIso(lastResult.checked_at, null),
      },
      last_triggered_at: options.resetRuntime
        ? normalizeIso(previous.last_triggered_at || raw.last_triggered_at, null)
        : normalizeIso(raw.last_triggered_at || previous.last_triggered_at, null),
      last_action: cleanString(raw.last_action || previous.last_action),
    });
  }
  return rules;
}

function buildAutomationRulesResponse(deviceId, doc) {
  return {
    device_id: deviceId,
    rules: normalizeAutomationRules(doc?.rules),
    last_action: doc?.last_action || null,
    last_action_at: doc?.last_action_at || null,
    worker_seen_at: doc?.worker_seen_at || null,
    updated_at: doc?.updated_at || null,
  };
}

function hasPortFlapTargets(targets) {
  return Boolean(targets?.lan?.length || targets?.wlan?.length);
}

function portFlapTargetKeys(targets) {
  const safeTargets = normalizePortFlapTargets(targets);
  return [
    ...safeTargets.lan.map((port) => `lan:${port}`),
    ...safeTargets.wlan.map((port) => `wlan:${port}`),
  ];
}

function portFlapTargetsFromKeys(keys) {
  const targets = { lan: [], wlan: [] };
  const seen = new Set();
  for (const key of Array.isArray(keys) ? keys : []) {
    const [kind, port] = String(key || "").split(":");
    const allowed = kind === "lan" ? PORT_FLAP_LAN_PORTS : kind === "wlan" ? PORT_FLAP_WLAN_PORTS : null;
    if (!allowed || !allowed.has(port) || seen.has(`${kind}:${port}`)) continue;
    seen.add(`${kind}:${port}`);
    targets[kind].push(port);
  }
  return targets;
}

function mergePortFlapTargets(...targetGroups) {
  const keys = [];
  for (const targets of targetGroups) {
    keys.push(...portFlapTargetKeys(targets));
  }
  return portFlapTargetsFromKeys(keys);
}

function readPortFlapStateFromStatus(statusDoc, targetKey) {
  const [kind, port] = String(targetKey || "").split(":");
  if (kind === "lan") {
    const entry = statusDoc?.lan_ports?.[port];
    if (typeof entry?.enable === "boolean") return entry.enable;
  }
  if (kind === "wlan") {
    const entry = statusDoc?.wifi?.[port];
    if (typeof entry?.enabled === "boolean") return entry.enabled;
  }
  return true;
}

function capturePortFlapRestoreStates(statusDoc, targetKeys, existingStates = {}) {
  const states = { ...(existingStates && typeof existingStates === "object" ? existingStates : {}) };
  for (const key of targetKeys) {
    if (typeof states[key] === "boolean") continue;
    states[key] = readPortFlapStateFromStatus(statusDoc, key);
  }
  return states;
}

function buildPortFlapResponse(deviceId, doc) {
  const currentState =
    doc?.current_state && typeof doc.current_state === "object" ? doc.current_state : {};
  const livePattern = Object.entries(currentState)
    .map(([key, value]) => {
      const enabled = Boolean(value?.enabled);
      const [kind, port] = String(key).split(":");
      const label = portFlapTargetLabel(kind, port);
      return {
        key,
        label,
        current_status: enabled ? "online" : "offline",
        next_status: enabled ? "offline" : "online",
        next_action_at: value?.next_action_at || null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    device_id: deviceId,
    enabled: Boolean(doc?.enabled),
    intensity: cleanPortFlapIntensity(doc?.intensity, "light"),
    targets: normalizePortFlapTargets(doc?.targets),
    restore_targets: normalizePortFlapTargets(doc?.restore_targets),
    current_state: currentState,
    live_pattern: livePattern,
    auto_enabled: Boolean(doc?.auto_enabled),
    auto_conditions: normalizePortFlapAutoConditions(doc?.auto_conditions),
    auto_last_trigger: doc?.auto_last_trigger || null,
    auto_last_trigger_at: doc?.auto_last_trigger_at || null,
    last_action: doc?.last_action || null,
    last_action_at: doc?.last_action_at || null,
    worker_seen_at: doc?.worker_seen_at || null,
    updated_at: doc?.updated_at || null,
  };
}

function decodeBase64Maybe(value) {
  const input = cleanString(value);
  if (!input) return null;
  try {
    const decoded = Buffer.from(input, "base64").toString("utf8");
    if (decoded && /^[\x20-\x7E]+$/.test(decoded)) {
      return decoded;
    }
  } catch {
    // Ignore invalid base64 and keep the raw value.
  }
  return input;
}

function normalizeIso(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function withoutMongoId(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const clone = { ...doc };
  delete clone._id;
  return clone;
}

function deviceSortValue(device) {
  return device.updated_at || device.createdAt || device.created_at || "";
}

function compareDevices(a, b) {
  const aUpdated = deviceSortValue(a);
  const bUpdated = deviceSortValue(b);
  if (aUpdated !== bUpdated) return bUpdated.localeCompare(aUpdated);
  return String(a.device_id || "").localeCompare(String(b.device_id || ""));
}

function buildManagedDeviceUpdate(body, existing = {}) {
  const createdAt = normalizeIso(body.createdAt, existing.createdAt || existing.created_at || new Date().toISOString());
  return {
    device_id: cleanString(body.device_id) || existing.device_id || null,
    name: "name" in body ? cleanString(body.name) : existing.name || null,
    type: "type" in body ? cleanString(body.type) : existing.type || null,
    ip: "ip" in body ? cleanString(body.ip) : existing.ip || null,
    port: "port" in body ? cleanNumber(body.port, 80) : existing.port || 80,
    username: "username" in body ? cleanString(body.username) : existing.username || "admin",
    password: "password" in body ? cleanString(body.password) : existing.password || null,
    notes: "notes" in body ? cleanString(body.notes) : existing.notes || null,
    networkGroup: "networkGroup" in body ? cleanString(body.networkGroup) : existing.networkGroup || null,
    createdAt,
  };
}

function buildStatusPatch(body) {
  const patch = {};

  if ("updated_at" in body) patch.updated_at = normalizeIso(body.updated_at, new Date().toISOString());
  if ("last_inform" in body) patch.last_inform = normalizeIso(body.last_inform, null);
  if ("wan_ip" in body) patch.wan_ip = cleanString(body.wan_ip);
  if ("is_online" in body) patch.is_online = cleanBoolean(body.is_online, null);
  if ("latency" in body) patch.latency = cleanNumber(body.latency, null);

  return patch;
}

function mergeDevice(statusDoc, managedDoc) {
  const status = withoutMongoId(statusDoc) || {};
  const managed = withoutMongoId(managedDoc) || {};
  const deviceId = managed.device_id || status.device_id;

  return {
    device_id: deviceId,
    ...status,
    name: managed.name || null,
    type: managed.type || null,
    ip: managed.ip || null,
    port: managed.port || 80,
    username: managed.username || "admin",
    password: managed.password || null,
    notes: managed.notes || null,
    networkGroup: managed.networkGroup || null,
    createdAt: managed.createdAt || managed.created_at || null,
  };
}

function parseMinutes(req, fallback) {
  const parsed = Number(req.query.minutes);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseIntervalMinutes(req, fallback = null) {
  const parsed = Number(req.query.intervalMinutes);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseLimit(req, fallback, max = fallback) {
  const parsed = Number(req.query.limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function trafficWindowStart(req, fallbackMinutes) {
  const explicitSince = cleanString(req.query.since);
  if (explicitSince) {
    const since = normalizeIso(explicitSince, null);
    if (since) return since;
  }
  return new Date(Date.now() - parseMinutes(req, fallbackMinutes) * 60 * 1000).toISOString();
}

function bucketIso(recordedAt, intervalMinutes) {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return null;
  const roundedMinutes = Math.floor(date.getUTCMinutes() / intervalMinutes) * intervalMinutes;
  date.setUTCMinutes(roundedMinutes, 0, 0);
  return date.toISOString();
}

function aggregateTrafficRows(rows, intervalMinutes) {
  if (!intervalMinutes || intervalMinutes <= 0) {
    return rows.map((row) => withoutMongoId(row));
  }

  const buckets = new Map();

  for (const row of rows) {
    const bucket = bucketIso(row.recorded_at, intervalMinutes);
    if (!bucket) continue;
    const current = buckets.get(bucket) || { recorded_at: bucket, device_id: row.device_id, sample_seconds: 0 };

    for (const [key, value] of Object.entries(withoutMongoId(row))) {
      if (key === "recorded_at" || key === "device_id") continue;

      if (key.endsWith("_d")) {
        current[key] = cleanNumber(current[key], 0) + cleanNumber(value, 0);
      } else if (key === "sample_seconds") {
        current.sample_seconds = cleanNumber(current.sample_seconds, 0) + cleanNumber(value, 0);
      } else {
        current[key] = value;
      }
    }

    buckets.set(bucket, current);
  }

  return Array.from(buckets.values()).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

function trimBom(value) {
  return String(value || "").replace(/^\uFEFF+/, "");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlAttributes(tag) {
  const attrs = {};
  String(tag || "").replace(/([:@\w.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, (_match, key, dQuoted, sQuoted, bare) => {
    attrs[key.toLowerCase()] = dQuoted ?? sQuoted ?? bare ?? "";
    return "";
  });
  return attrs;
}

function extractInputs(html) {
  const inputs = [];
  const text = String(html || "");
  const regex = /<input\b[^>]*>/gi;
  let match;
  while ((match = regex.exec(text))) {
    const tag = match[0];
    const attrs = parseHtmlAttributes(tag);
    inputs.push({
      tag,
      attrs,
      name: attrs.name || null,
      type: String(attrs.type || "text").toLowerCase(),
      value: attrs.value || "",
      checked: /\bchecked\b/i.test(tag),
    });
  }
  return inputs;
}

function extractButtons(html) {
  const buttons = [];
  for (const input of extractInputs(html)) {
    if (input.type === "submit" || input.type === "button") {
      buttons.push({
        name: input.name,
        value: input.value,
        text: input.value,
        type: input.type,
      });
    }
  }

  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = buttonRegex.exec(String(html || "")))) {
    const attrs = parseHtmlAttributes(match[1]);
    const text = stripHtml(match[2]);
    buttons.push({
      name: attrs.name || null,
      value: attrs.value || text,
      text,
      type: String(attrs.type || "button").toLowerCase(),
    });
  }
  return buttons;
}

function extractSelects(html) {
  const selects = [];
  const regex = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let match;
  while ((match = regex.exec(String(html || "")))) {
    const attrs = parseHtmlAttributes(match[1]);
    const options = [];
    const optionRegex = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let optionMatch;
    while ((optionMatch = optionRegex.exec(match[2]))) {
      const optionAttrs = parseHtmlAttributes(optionMatch[1]);
      options.push({
        value: optionAttrs.value || stripHtml(optionMatch[2]),
        label: stripHtml(optionMatch[2]),
        selected: /\bselected\b/i.test(optionMatch[0]),
      });
    }

    selects.push({
      name: attrs.name || null,
      options,
      selectedValue: options.find((option) => option.selected)?.value ?? options[0]?.value ?? "",
    });
  }
  return selects;
}

function extractFirstMatch(text, pattern, fallback = null) {
  const match = String(text || "").match(pattern);
  return match ? match[1] : fallback;
}

function normalizePagePath(pathname) {
  if (!pathname) return null;
  try {
    const url = new URL(pathname, "http://router.invalid");
    return `${url.pathname}${url.search || ""}`;
  } catch {
    return pathname.startsWith("/") ? pathname : `/${pathname}`;
  }
}

function normalizeActionPath(action, pagePath) {
  const cleaned = cleanString(action);
  if (cleaned) return normalizePagePath(cleaned);

  const normalizedPage = normalizePagePath(pagePath);
  if (!normalizedPage) return null;
  if (normalizedPage.includes("/html/security/")) {
    const requestFile = normalizedPage.replace(/^\//, "");
    return `/html/security/set.cgi?x=InternetGatewayDevice.X_HW_Security&RequestFile=${requestFile}`;
  }
  return null;
}

function findActionPath(html, pagePath) {
  const formAction = extractFirstMatch(html, /<form\b[^>]*action=["']([^"']*set\.cgi[^"']*)["']/i, null);
  if (formAction) return normalizePagePath(formAction);

  const rawAction = extractFirstMatch(html, /(\/[^"' ]*set\.cgi\?[^"' ]*)/i, null);
  return normalizeActionPath(rawAction, pagePath);
}

function huaweiBooleanValue(fieldValue, enabled) {
  const current = String(fieldValue || "").toLowerCase();
  if (/^(true|false)$/.test(current)) return enabled ? "true" : "false";
  if (/^(on|off)$/.test(current)) return enabled ? "on" : "off";
  if (/^(open|close|opened|closed)$/.test(current)) return enabled ? "open" : "close";
  if (/^(enable|disable|enabled|disabled)$/.test(current)) return enabled ? "enable" : "disable";
  return enabled ? "1" : "0";
}

function pickButton(buttons, matcher) {
  return buttons.find((button) => {
    const text = `${button.text || ""} ${button.value || ""}`.toLowerCase();
    return matcher(text);
  }) || null;
}

function findFilterMacs(html) {
  const matches = String(html || "").match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/gi) || [];
  return normalizeMacList(matches);
}

function parseHuaweiFilterPage(html, pagePath, kind) {
  const inputs = extractInputs(html);
  const selects = extractSelects(html);
  const buttons = extractButtons(html);
  const token = extractFirstMatch(
    html,
    /<input\b[^>]*name=["']onttoken["'][^>]*value=["']([^"']+)["']/i,
    extractFirstMatch(html, /id=["']hwonttoken["'][^>]*value=["']([^"']+)["']/i, null),
  );

  const hiddenFields = {};
  for (const input of inputs) {
    if (input.type !== "hidden" || !input.name) continue;
    hiddenFields[input.name] = input.value || "";
  }

  const checkboxCandidates = inputs.filter((input) => input.name && /(filter|mac|wlan)/i.test(input.name));
  const enableField =
    checkboxCandidates.find((input) => /(enable|right|state)/i.test(input.name)) ||
    inputs.find((input) => input.type === "checkbox" && input.name && !/delete|select/i.test(input.name)) ||
    null;

  const modeField =
    selects.find((select) =>
      select.options.some((option) => /blacklist|whitelist/i.test(`${option.label} ${option.value}`)),
    ) || null;

  const macInput =
    inputs.find((input) => input.type === "text" && input.name && /mac/i.test(input.name)) ||
    inputs.find((input) => input.type === "text" && input.name) ||
    null;

  const rowSelections = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(String(html || "")))) {
    const rowHtml = rowMatch[1];
    const mac = normalizeMac((rowHtml.match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i) || [])[1]);
    if (!mac) continue;
    const checkboxTag = (rowHtml.match(/<input\b[^>]*type=["']checkbox["'][^>]*>/i) || [])[0];
    if (!checkboxTag) continue;
    const attrs = parseHtmlAttributes(checkboxTag);
    rowSelections.push({
      mac,
      name: attrs.name || null,
      value: attrs.value || "on",
    });
  }

  const actionPath = findActionPath(html, pagePath);
  const applyButton = pickButton(buttons, (text) => text.includes("apply"));
  const deleteButton = pickButton(buttons, (text) => text.includes("delete"));
  const addButton = pickButton(buttons, (text) => text.includes("new") || text.includes("add"));
  const pageText = stripHtml(html).toLowerCase();
  const enabled =
    enableField
      ? enableField.checked || /:\s*(1|true|enable|enabled|open)\b/i.test(`${enableField.name}:${enableField.value}`)
      : /enable (?:wlan )?mac filter/i.test(pageText) && /blacklist|whitelist/i.test(pageText);
  const currentMode = modeField?.options.find((option) => option.value === modeField.selectedValue)?.label || modeField?.selectedValue || "Blacklist";

  return {
    kind,
    pagePath: normalizePagePath(pagePath),
    actionPath,
    token,
    enabled,
    mode: /white/i.test(currentMode) ? "Whitelist" : "Blacklist",
    macs: findFilterMacs(html),
    hiddenFields,
    enableField,
    modeField,
    macInput,
    rowSelections,
    applyButton,
    deleteButton,
    addButton,
  };
}

function resolveFilterChannel(interfaceType, fallback = "wired") {
  const normalized = String(interfaceType || "").toLowerCase();
  if (/wireless|wifi|wi-fi|wlan|802\.11/.test(normalized)) return "wifi";
  return fallback;
}

function blockChannelLabel(channel) {
  return channel === "wifi" ? "Wi-Fi MAC Filter" : "MAC Filter";
}

function filterStateShape(channel, state) {
  return {
    enabled: cleanBoolean(state?.enabled, false) ?? false,
    mode: /white/i.test(cleanString(state?.mode) || "") ? "Whitelist" : "Blacklist",
    macs: normalizeMacList(state?.macs || []),
    page_path: cleanString(state?.page_path),
    page_label: blockChannelLabel(channel),
  };
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  set(name, value) {
    if (!name) return;
    this.cookies.set(String(name), String(value ?? ""));
  }

  importFromSetCookie(setCookie) {
    const items = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const cookie of items) {
      const pair = String(cookie).split(";")[0];
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      this.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }

  header(extraCookie = null) {
    const pairs = Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`);
    if (extraCookie) pairs.unshift(extraCookie);
    return pairs.join("; ");
  }
}

function modemRequest(urlString, { method = "GET", headers = {}, body, cookieJar, extraCookie, timeoutMs = MODEM_TIMEOUT_MS, redirects = 4 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === "https:" ? https : http;
    const requestHeaders = { ...headers };
    if (cookieJar || extraCookie) {
      requestHeaders.Cookie = cookieJar?.header(extraCookie) || extraCookie;
    }
    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: requestHeaders,
      rejectUnauthorized: false,
    };

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", async () => {
        cookieJar?.importFromSetCookie(res.headers["set-cookie"]);

        if (
          redirects > 0 &&
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          try {
            const location = new URL(res.headers.location, urlString).toString();
            const nextMethod = res.statusCode === 303 ? "GET" : method;
            const nextBody = res.statusCode === 303 ? undefined : body;
            const redirected = await modemRequest(location, {
              method: nextMethod,
              headers,
              body: nextBody,
              cookieJar,
              timeoutMs,
              redirects: redirects - 1,
            });
            return resolve(redirected);
          } catch (error) {
            return reject(error);
          }
        }

        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          url: urlString,
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function probeHuaweiOrigin(target) {
  const host = cleanString(target.host);
  if (!host) throw new Error("Missing modem host");
  const portValue = cleanNumber(target.port, 80) || 80;
  const port = String(portValue);
  const candidates = [
    `https://${host}:${port}`,
    `http://${host}:${port}`,
  ];

  let lastError = null;
  for (const origin of candidates) {
    try {
      const response = await modemRequest(`${origin}/asp/GetRandCount.asp`);
      const token = trimBom(response.body).trim().replace(/^[^0-9a-f]+/i, "");
      if (response.status >= 200 && response.status < 400 && /^[0-9a-f]{32}$/i.test(token)) {
        return { origin, token };
      }
      lastError = new Error(`Unexpected token response from ${origin}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to reach modem web UI");
}

function isHuaweiLoginPage(html) {
  const source = String(html || "");
  return /GetRandCnt\(/.test(source) || /login\.cgi/i.test(source) || /UserNameAdmin/i.test(source);
}

async function loginHuaweiModem(target) {
  const username = cleanString(target.username);
  const password = cleanString(target.password);
  if (!username || !password) {
    throw new Error("Modem username/password are not configured");
  }

  const { origin, token } = await probeHuaweiOrigin(target);
  const cookieJar = new CookieJar();
  const passwordCandidates = Array.from(
    new Set([password, decodeBase64Maybe(password)].filter(Boolean)),
  );

  let loginError = null;
  for (const candidatePassword of passwordCandidates) {
    const loginCookie = `UserName:${username}:PassWord:${Buffer.from(candidatePassword, "utf8").toString("base64")}:Language:${HUAWEI_LANGUAGE}:id=-1`;
    const loginBody = new URLSearchParams({
      "x.X_HW_Token": token,
      UserName: username,
      PassWord: Buffer.from(candidatePassword, "utf8").toString("base64"),
      Language: HUAWEI_LANGUAGE,
    }).toString();

    await modemRequest(`${origin}/login.cgi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: origin,
        Referer: `${origin}/`,
      },
      body: loginBody,
      cookieJar,
      extraCookie: loginCookie,
    });

    const homeCandidates = [
      "/html/frame_huawei/index.asp",
      "/index.asp",
      "/",
    ];

    for (const pagePath of homeCandidates) {
      const page = await modemRequest(`${origin}${pagePath}`, {
        cookieJar,
        headers: { Referer: `${origin}/` },
      });
      if (page.status >= 200 && page.status < 400 && !isHuaweiLoginPage(page.body)) {
        return {
          origin,
          cookieJar,
          username,
          password: candidatePassword,
          homePath: pagePath,
        };
      }
    }

    loginError = new Error("Huawei login failed");
  }

  throw loginError || new Error("Huawei login failed");
}

async function getHuaweiMenuEntries(session) {
  const endpoints = [
    "/getMenuArray.asp",
    "/html/frame_huawei/asp/getMenuArray.asp",
  ];
  const entries = [];

  for (const endpoint of endpoints) {
    try {
      const response = await modemRequest(`${session.origin}${endpoint}`, {
        method: "POST",
        cookieJar: session.cookieJar,
        headers: {
          Referer: `${session.origin}${session.homePath || "/"}`,
        },
      });
      const text = trimBom(response.body);
      const regex = /name\s*:\s*["']([^"']+)["']\s*,\s*url\s*:\s*["']([^"']+)["']/gi;
      let match;
      while ((match = regex.exec(text))) {
        entries.push({
          label: match[1],
          path: normalizePagePath(match[2]),
        });
      }
      if (entries.length > 0) break;
    } catch {
      // Ignore and try the next menu endpoint.
    }
  }

  return entries;
}

function pickFilterPage(entries, kind) {
  for (const entry of entries) {
    const label = String(entry.label || "").toLowerCase();
    const isWifi = /wi-?fi|wlan/.test(label);
    const isMacFilter = label.includes("mac") && label.includes("filter");
    if (!isMacFilter) continue;
    if (kind === "wifi" && isWifi) return entry.path;
    if (kind === "wired" && !isWifi) return entry.path;
  }
  return null;
}

function filterPageFallbacks(kind) {
  return kind === "wifi"
    ? [
        "/html/AllUsers/html/bbsp/wlanmacfilter/wlanmacfilter.asp",
        "/html/ntwkall/wlmacflt.asp",
        "/ntwkall/wlmacflt.asp",
      ]
    : [
        "/html/AllUsers/html/bbsp/macfilter/macfilter.asp",
        "/html/security/macfilter.asp",
        "/security/macfilter.asp",
      ];
}

async function discoverFilterPage(session, kind) {
  const entries = await getHuaweiMenuEntries(session);
  const discovered = pickFilterPage(entries, kind);
  if (discovered) return discovered;

  for (const candidate of filterPageFallbacks(kind)) {
    try {
      const response = await modemRequest(`${session.origin}${candidate}`, {
        cookieJar: session.cookieJar,
        headers: {
          Referer: `${session.origin}${session.homePath || "/"}`,
        },
      });
      if (response.status >= 200 && response.status < 400 && !isHuaweiLoginPage(response.body)) {
        return normalizePagePath(candidate);
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to discover ${kind === "wifi" ? "Wi-Fi" : "MAC"} filter page`);
}

async function fetchFilterPage(session, pagePath, kind) {
  const response = await modemRequest(`${session.origin}${pagePath}`, {
    cookieJar: session.cookieJar,
    headers: {
      Referer: `${session.origin}${session.homePath || "/"}`,
    },
  });

  if (response.status < 200 || response.status >= 400 || isHuaweiLoginPage(response.body)) {
    throw new Error(`Failed to load ${pagePath}`);
  }

  return parseHuaweiFilterPage(response.body, pagePath, kind);
}

function buildFilterPayload(page, nextState, mutation) {
  if (!page.actionPath || !page.token) {
    throw new Error("Missing filter form action or token");
  }

  const payload = new URLSearchParams();
  for (const [name, value] of Object.entries(page.hiddenFields || {})) {
    payload.set(name, value);
  }
  payload.set("x.X_HW_Token", page.token);

  if (page.enableField?.name) {
    payload.set(
      page.enableField.name,
      huaweiBooleanValue(page.enableField.value || page.hiddenFields?.[page.enableField.name], nextState.enabled),
    );
  }

  if (page.modeField?.name) {
    const nextOption =
      page.modeField.options.find((option) => /blacklist/i.test(option.label) || /blacklist/i.test(option.value)) ||
      page.modeField.options.find((option) => /whitelist/i.test(option.label) || /whitelist/i.test(option.value)) ||
      null;
    const fallbackValue = page.modeField.selectedValue || nextOption?.value || page.modeField.options[0]?.value || "Blacklist";
    if (nextState.mode === "Blacklist") {
      const blackOption =
        page.modeField.options.find((option) => /blacklist/i.test(`${option.label} ${option.value}`)) ||
        null;
      payload.set(page.modeField.name, blackOption?.value || fallbackValue);
    } else {
      payload.set(page.modeField.name, fallbackValue);
    }
  }

  if (mutation.type === "add") {
    if (!page.macInput?.name) throw new Error("Missing MAC address input field");
    payload.set(page.macInput.name, mutation.mac);
    if (page.applyButton?.name) payload.set(page.applyButton.name, page.applyButton.value || "Apply");
    if (page.addButton?.name) payload.set(page.addButton.name, page.addButton.value || "New");
  } else if (mutation.type === "remove") {
    const row = page.rowSelections.find((entry) => entry.mac === mutation.mac);
    if (!row?.name) throw new Error("Unable to select MAC entry for deletion");
    payload.set(row.name, row.value || "on");
    if (page.deleteButton?.name) payload.set(page.deleteButton.name, page.deleteButton.value || "Delete");
  } else if (page.applyButton?.name) {
    payload.set(page.applyButton.name, page.applyButton.value || "Apply");
  }

  return payload.toString();
}

async function mutateFilterPage(session, pagePath, kind, mutation) {
  const page = await fetchFilterPage(session, pagePath, kind);
  const currentState = {
    enabled: page.enabled,
    mode: page.mode,
    macs: page.macs,
  };

  const nextState = {
    enabled: mutation.enabled ?? currentState.enabled,
    mode: mutation.mode || currentState.mode,
    macs: [...currentState.macs],
  };

  if (mutation.type === "add") {
    nextState.macs = normalizeMacList([...currentState.macs, mutation.mac]);
  } else if (mutation.type === "remove") {
    nextState.macs = currentState.macs.filter((mac) => mac !== mutation.mac);
  }

  const payload = buildFilterPayload(page, nextState, mutation);
  await modemRequest(`${session.origin}${page.actionPath}`, {
    method: "POST",
    cookieJar: session.cookieJar,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: session.origin,
      Referer: `${session.origin}${page.pagePath}`,
    },
    body: payload,
  });

  const verified = await fetchFilterPage(session, page.pagePath, kind);
  return {
    enabled: verified.enabled,
    mode: verified.mode,
    macs: verified.macs,
    page_path: verified.pagePath,
  };
}

function macIsListed(filterState, channel, mac) {
  const state = channel === "wifi" ? filterState?.wifi : filterState?.wired;
  return normalizeMacList(state?.macs || []).includes(mac);
}

function mergeClientRow(row, override, filterState) {
  const mac = normalizeMac(row?.mac || override?.mac);
  const recordedAt =
    normalizeIso(override?.updated_at, null) && normalizeIso(row?.recorded_at, null)
      ? (new Date(override.updated_at).getTime() > new Date(row.recorded_at).getTime() ? override.updated_at : row.recorded_at)
      : normalizeIso(override?.updated_at, row?.recorded_at || null);
  const wiredListed = mac ? macIsListed(filterState, "wired", mac) : false;
  const wifiListed = mac ? macIsListed(filterState, "wifi", mac) : false;
  const listed = wiredListed || wifiListed;
  const requestedBlocked = typeof override?.is_trusted === "boolean" ? !override.is_trusted : listed;
  const blockChannel =
    cleanFilterChannel(override?.block_channel, null) ||
    (wifiListed ? "wifi" : wiredListed ? "wired" : resolveFilterChannel(row?.interface_type, "wired"));
  const syncStatus =
    cleanFilterSyncStatus(override?.block_sync_status, null) ||
    (listed === requestedBlocked ? "synced" : null);

  return {
    ...withoutMongoId(row || {
      device_id: override?.device_id || null,
      recorded_at: recordedAt,
      hostname: null,
      ip: "",
      mac,
      interface_type: null,
      active: false,
    }),
    recorded_at: recordedAt,
    mac,
    custom_name: override?.custom_name || null,
    original_name: override?.original_name || cleanString(row?.hostname),
    is_trusted: typeof override?.is_trusted === "boolean" ? override.is_trusted : !listed,
    is_blocked: requestedBlocked,
    block_channel: requestedBlocked ? blockChannel : null,
    block_sync_status: requestedBlocked ? syncStatus : cleanFilterSyncStatus(override?.block_sync_status, null),
    block_sync_error: cleanString(override?.block_sync_error),
  };
}

function buildMacFilterResponse(deviceId, cachedState, configError = null) {
  const wired = filterStateShape("wired", cachedState?.wired);
  const wifi = filterStateShape("wifi", cachedState?.wifi);
  const available = !configError;
  const masterEnabled = wired.enabled && wifi.enabled;

  return {
    device_id: deviceId,
    available,
    enabled: available ? masterEnabled : false,
    wired,
    wifi,
    updated_at: normalizeIso(cachedState?.updated_at, null),
    last_error: cleanString(cachedState?.last_error),
    config_error: cleanString(configError),
  };
}

async function resolveModemTarget(deviceId, managedDevices, deviceStatus) {
  const [managedDoc, statusDoc] = await Promise.all([
    managedDevices.findOne({ device_id: deviceId }),
    deviceStatus.findOne({ device_id: deviceId }),
  ]);

  const username = cleanString(managedDoc?.username) || "admin";
  const rawPassword = cleanString(managedDoc?.password);
  const host = cleanString(managedDoc?.ip) || cleanString(statusDoc?.wan_ip);
  const target = {
    host,
    port: cleanNumber(managedDoc?.port, 80) || 80,
    username,
    password: rawPassword,
  };

  let configError = null;
  if (!host) {
    configError = "Modem IP is not configured and no WAN IP fallback is available.";
  } else if (!rawPassword) {
    configError = "Modem password is missing in managed device settings.";
  }

  return {
    managedDoc,
    statusDoc,
    target,
    configError,
  };
}

async function refreshMacFilterState({
  deviceId,
  managedDevices,
  deviceStatus,
  deviceFilterState,
}) {
  const cached = await deviceFilterState.findOne({ device_id: deviceId });
  const modem = await resolveModemTarget(deviceId, managedDevices, deviceStatus);
  if (modem.configError) {
    return buildMacFilterResponse(deviceId, cached, modem.configError);
  }

  try {
    const session = await loginHuaweiModem(modem.target);
    const wiredPath = await discoverFilterPage(session, "wired");
    const wifiPath = await discoverFilterPage(session, "wifi");
    const [wired, wifi] = await Promise.all([
      fetchFilterPage(session, wiredPath, "wired"),
      fetchFilterPage(session, wifiPath, "wifi"),
    ]);

    const nextState = {
      device_id: deviceId,
      wired: {
        enabled: wired.enabled,
        mode: wired.mode,
        macs: wired.macs,
        page_path: wired.pagePath,
      },
      wifi: {
        enabled: wifi.enabled,
        mode: wifi.mode,
        macs: wifi.macs,
        page_path: wifi.pagePath,
      },
      updated_at: new Date().toISOString(),
      last_error: null,
    };

    await deviceFilterState.updateOne(
      { device_id: deviceId },
      { $set: nextState },
      { upsert: true },
    );

    return buildMacFilterResponse(deviceId, nextState, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh modem MAC filter state.";
    await deviceFilterState.updateOne(
      { device_id: deviceId },
      {
        $set: {
          device_id: deviceId,
          updated_at: new Date().toISOString(),
          last_error: message,
        },
      },
      { upsert: true },
    );

    const hasCachedState = Boolean(cached?.wired || cached?.wifi);
    const fallbackState = cached
      ? { ...cached, last_error: message, updated_at: new Date().toISOString() }
      : { last_error: message };
    return buildMacFilterResponse(deviceId, fallbackState, hasCachedState ? null : message);
  }
}

async function updateMacFilterMaster({
  deviceId,
  enabled,
  managedDevices,
  deviceStatus,
  deviceFilterState,
}) {
  const modem = await resolveModemTarget(deviceId, managedDevices, deviceStatus);
  if (modem.configError) {
    throw new Error(modem.configError);
  }

  const session = await loginHuaweiModem(modem.target);
  const current = await refreshMacFilterState({
    deviceId,
    managedDevices,
    deviceStatus,
    deviceFilterState,
  });
  if (!current.available) {
    throw new Error(current.config_error || current.last_error || "Unable to read current MAC filter state.");
  }

  const wiredResult = await mutateFilterPage(
    session,
    current.wired.page_path,
    "wired",
    { type: "toggle", enabled, mode: "Blacklist" },
  );
  const wifiResult = await mutateFilterPage(
    session,
    current.wifi.page_path,
    "wifi",
    { type: "toggle", enabled, mode: "Blacklist" },
  );

  const nextState = {
    device_id: deviceId,
    wired: wiredResult,
    wifi: wifiResult,
    updated_at: new Date().toISOString(),
    last_error: null,
  };

  await deviceFilterState.updateOne(
    { device_id: deviceId },
    { $set: nextState },
    { upsert: true },
  );

  return buildMacFilterResponse(deviceId, nextState, null);
}

async function syncClientBlockState({
  deviceId,
  mac,
  shouldBlock,
  interfaceType,
  existingOverride,
  managedDevices,
  deviceStatus,
  deviceFilterState,
}) {
  const modem = await resolveModemTarget(deviceId, managedDevices, deviceStatus);
  if (modem.configError) {
    return {
      ok: false,
      error: modem.configError,
      block_channel: cleanFilterChannel(existingOverride?.block_channel, resolveFilterChannel(interfaceType, "wired")),
    };
  }

  try {
    const session = await loginHuaweiModem(modem.target);
    const state = await refreshMacFilterState({
      deviceId,
      managedDevices,
      deviceStatus,
      deviceFilterState,
    });
    if (!state.available) {
      throw new Error(state.config_error || state.last_error || "Unable to read MAC filter pages.");
    }

    const preferredChannel =
      cleanFilterChannel(existingOverride?.block_channel, null) ||
      (state.wifi.macs.includes(mac) ? "wifi" : state.wired.macs.includes(mac) ? "wired" : resolveFilterChannel(interfaceType, "wired"));

    const mutationMap = [];
    if (shouldBlock) {
      mutationMap.push({
        channel: preferredChannel,
        mutation: { type: "add", enabled: state.enabled, mode: "Blacklist", mac },
      });
    } else {
      if (state.wired.macs.includes(mac)) mutationMap.push({ channel: "wired", mutation: { type: "remove", enabled: state.wired.enabled, mode: state.wired.mode, mac } });
      if (state.wifi.macs.includes(mac)) mutationMap.push({ channel: "wifi", mutation: { type: "remove", enabled: state.wifi.enabled, mode: state.wifi.mode, mac } });
      if (mutationMap.length === 0) {
        mutationMap.push({
          channel: preferredChannel,
          mutation: { type: "remove", enabled: preferredChannel === "wifi" ? state.wifi.enabled : state.wired.enabled, mode: "Blacklist", mac },
        });
      }
    }

    const next = {
      device_id: deviceId,
      wired: {
        ...state.wired,
        page_path: state.wired.page_path,
      },
      wifi: {
        ...state.wifi,
        page_path: state.wifi.page_path,
      },
      updated_at: new Date().toISOString(),
      last_error: null,
    };

    for (const item of mutationMap) {
      const result = await mutateFilterPage(
        session,
        item.channel === "wifi" ? state.wifi.page_path : state.wired.page_path,
        item.channel,
        item.mutation,
      );
      next[item.channel] = result;
    }

    await deviceFilterState.updateOne(
      { device_id: deviceId },
      { $set: next },
      { upsert: true },
    );

    return {
      ok: true,
      block_channel: shouldBlock ? preferredChannel : null,
      filterState: buildMacFilterResponse(deviceId, next, null),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update modem MAC filter list.",
      block_channel: cleanFilterChannel(existingOverride?.block_channel, resolveFilterChannel(interfaceType, "wired")),
    };
  }
}

async function getMergedClientsSnapshot(deviceId, connectedClients, clientOverrides, deviceFilterState) {
  const [rows, overrides, filterState] = await Promise.all([
    connectedClients.find({ device_id: deviceId }).sort({ active: -1, recorded_at: -1 }).toArray(),
    clientOverrides.find({ device_id: deviceId }).toArray(),
    deviceFilterState.findOne({ device_id: deviceId }),
  ]);

  const overrideByMac = new Map(
    overrides
      .map((row) => [normalizeMac(row.mac), row])
      .filter(([mac]) => mac),
  );

  return rows.map((row) => mergeClientRow(row, overrideByMac.get(normalizeMac(row.mac)), filterState));
}

let _mergedClientsCache = null;
let _mergedClientsCachedAt = 0;
const MERGED_CLIENTS_CACHE_TTL_MS = 2_000;

async function getAllMergedClientsSnapshot(connectedClients, clientOverrides, deviceFilterState, limit = 150) {
  const now = Date.now();
  if (_mergedClientsCache && now - _mergedClientsCachedAt < MERGED_CLIENTS_CACHE_TTL_MS) {
    return _mergedClientsCache;
  }
  const rows = await connectedClients
    .find({})
    .sort({ active: -1, recorded_at: -1 })
    .limit(limit)
    .toArray();

  const deviceIds = [...new Set(rows.map((row) => row.device_id).filter(Boolean))];
  const [overrides, filterStates] = await Promise.all([
    clientOverrides.find({ device_id: { $in: deviceIds } }).toArray(),
    deviceFilterState.find({ device_id: { $in: deviceIds } }).toArray(),
  ]);

  const overridesByKey = new Map(
    overrides
      .map((row) => [`${row.device_id}::${normalizeMac(row.mac)}`, row])
      .filter(([key]) => !key.endsWith("::null")),
  );
  const filterStateByDeviceId = new Map(filterStates.map((row) => [row.device_id, row]));

  const result = rows.map((row) =>
    mergeClientRow(
      row,
      overridesByKey.get(`${row.device_id}::${normalizeMac(row.mac)}`),
      filterStateByDeviceId.get(row.device_id),
    ),
  );
  _mergedClientsCache = result;
  _mergedClientsCachedAt = Date.now();
  return result;
}

async function startServer() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const deviceStatus = db.collection("device_status");
    const connectedClients = db.collection("connected_clients");
    const managedDevices = db.collection("managed_devices");
    const clientOverrides = db.collection("client_overrides");
    const deviceFilterState = db.collection("device_filter_state");
    const deviceCommands = db.collection("device_commands");
    const devicePortFlap = db.collection("device_port_flap");
    const deviceAutomationRules = db.collection("device_automation_rules");
    const deviceWifiSchedules = db.collection("device_wifi_schedules");
    const deviceLanAutomation = db.collection("device_lan_automation");
    const deviceRoutingAutomation = db.collection("device_routing_automation");
    const dataUsage = db.collection("data_usage");
    const deviceSettings = db.collection("device_settings");

    await Promise.all([
      deviceStatus.createIndex({ device_id: 1 }),
      deviceStatus.createIndex({ updated_at: -1 }),
      connectedClients.createIndex({ device_id: 1, mac: 1 }),
      connectedClients.createIndex({ active: -1, recorded_at: -1 }),
      connectedClients.createIndex({ recorded_at: -1 }),
      clientOverrides.createIndex({ device_id: 1, mac: 1 }),
      deviceFilterState.createIndex({ device_id: 1 }, { unique: true }),
      managedDevices.createIndex({ device_id: 1 }),
      deviceCommands.createIndex({ device_id: 1, status: 1, created_at: -1 }),
      devicePortFlap.createIndex({ device_id: 1 }, { unique: true }),
      deviceAutomationRules.createIndex({ device_id: 1 }, { unique: true }),
      deviceWifiSchedules.createIndex({ device_id: 1 }, { unique: true }),
      deviceLanAutomation.createIndex({ device_id: 1 }, { unique: true }),
      deviceRoutingAutomation.createIndex({ device_id: 1 }, { unique: true }),
      dataUsage.createIndex({ device_id: 1, interface: 1, period: 1, period_key: 1 }),
      deviceSettings.createIndex({ device_id: 1 }, { unique: true }),
    ]);

    app.get("/api/health", async (_req, res) => {
      try {
        const ping = await db.command({ ping: 1 });
        const genieDb = client.db("genieacs");
        const [tasks, faults] = await Promise.all([
          genieDb.collection("tasks").estimatedDocumentCount(),
          genieDb.collection("faults").estimatedDocumentCount(),
        ]);
        const lastStatus = await deviceStatus.findOne({}, { sort: { updated_at: -1 }, projection: { updated_at: 1 } });
        const lastStatusAgeMs = lastStatus?.updated_at ? Date.now() - new Date(lastStatus.updated_at).getTime() : null;
        res.json({
          ok: true,
          mongo: ping.ok === 1 ? "up" : "degraded",
          uptimeSeconds: Math.round(process.uptime()),
          startedAt: new Date(processStartedAt).toISOString(),
          now: new Date().toISOString(),
          sseClients: sseClients.size,
          changeStreamsActive: statusChangeStream !== null,
          acsBacklog: { tasks, faults },
          lastStatusUpdateAgeMs: lastStatusAgeMs,
          lastStatusUpdateAt: lastStatus?.updated_at || null,
        });
      } catch (err) {
        res.status(503).json({
          ok: false,
          error: err.message,
          uptimeSeconds: Math.round(process.uptime()),
          startedAt: new Date(processStartedAt).toISOString(),
          now: new Date().toISOString(),
        });
      }
    });

    app.get("/api/devices", async (_req, res) => {
      try {
        const [statusDocs, managedDocs] = await Promise.all([
          deviceStatus.find({}).toArray(),
          managedDevices.find({}).toArray(),
        ]);

        const statusById = new Map(statusDocs.map((doc) => [doc.device_id, doc]));
        const managedById = new Map(managedDocs.map((doc) => [doc.device_id, doc]));
        const ids = new Set([...statusById.keys(), ...managedById.keys()]);

        const devices = Array.from(ids)
          .map((id) => mergeDevice(statusById.get(id), managedById.get(id)))
          .sort(compareDevices);

        res.json(devices);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/devices/:id", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const [statusDoc, managedDoc] = await Promise.all([
          deviceStatus.findOne({ device_id: deviceId }),
          managedDevices.findOne({ device_id: deviceId }),
        ]);

        if (!statusDoc && !managedDoc) {
          return res.status(404).json({ error: "Device not found" });
        }

        res.json(mergeDevice(statusDoc, managedDoc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/devices", async (req, res) => {
      try {
        const deviceId = cleanString(req.body.device_id);
        if (!deviceId) {
          return res.status(400).json({ error: "device_id is required" });
        }

        const existingManaged = await managedDevices.findOne({ device_id: deviceId });
        const managedPatch = buildManagedDeviceUpdate({ ...req.body, device_id: deviceId }, existingManaged || {});
        await managedDevices.updateOne(
          { device_id: deviceId },
          { $set: managedPatch },
          { upsert: true },
        );

        const statusPatch = buildStatusPatch(req.body);
        if (Object.keys(statusPatch).length > 0) {
          await deviceStatus.updateOne(
            { device_id: deviceId },
            { $set: { device_id: deviceId, ...statusPatch } },
            { upsert: true },
          );
        }

        const [statusDoc, managedDoc] = await Promise.all([
          deviceStatus.findOne({ device_id: deviceId }),
          managedDevices.findOne({ device_id: deviceId }),
        ]);

        res.status(201).json(mergeDevice(statusDoc, managedDoc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put("/api/devices/:id", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const managedDoc = buildManagedDeviceUpdate(
          { ...req.body, device_id: deviceId },
          { device_id: deviceId },
        );

        await managedDevices.updateOne(
          { device_id: deviceId },
          { $set: managedDoc },
          { upsert: true },
        );

        const currentStatus = await deviceStatus.findOne({ device_id: deviceId });
        res.json(mergeDevice(currentStatus, managedDoc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/devices/:id", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const existingManaged = await managedDevices.findOne({ device_id: deviceId });
        const managedPatch = buildManagedDeviceUpdate(
          { ...existingManaged, ...req.body, device_id: deviceId },
          existingManaged || { device_id: deviceId },
        );

        await managedDevices.updateOne(
          { device_id: deviceId },
          { $set: managedPatch },
          { upsert: true },
        );

        const statusPatch = buildStatusPatch(req.body);
        if (Object.keys(statusPatch).length > 0) {
          await deviceStatus.updateOne(
            { device_id: deviceId },
            { $set: { device_id: deviceId, ...statusPatch } },
            { upsert: true },
          );
        }

        const [statusDoc, managedDoc] = await Promise.all([
          deviceStatus.findOne({ device_id: deviceId }),
          managedDevices.findOne({ device_id: deviceId }),
        ]);

        res.json(mergeDevice(statusDoc, managedDoc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/devices/:id/status", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const statusPatch = buildStatusPatch(req.body);
        if (!statusPatch.updated_at) {
          statusPatch.updated_at = new Date().toISOString();
        }

        await deviceStatus.updateOne(
          { device_id: deviceId },
          { $set: { device_id: deviceId, ...statusPatch } },
          { upsert: true },
        );

        const [statusDoc, managedDoc] = await Promise.all([
          deviceStatus.findOne({ device_id: deviceId }),
          managedDevices.findOne({ device_id: deviceId }),
        ]);

        res.json(mergeDevice(statusDoc, managedDoc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete("/api/devices/:id/clients/history", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const result = await connectedClients.deleteMany({ device_id: deviceId, active: false });
        res.json({ ok: true, deletedCount: result.deletedCount });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete all connected_clients for a device, but keep those that have a
    // custom_name saved in client_overrides (i.e. the user has renamed them),
    // UNLESS the custom_name is "Delete" (case-insensitive) — those are
    // explicitly marked for removal by the user.
    app.delete("/api/devices/:id/clients/all", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);

        // Find MACs that the user has given a custom name to.
        const renamedOverrides = await clientOverrides
          .find({ device_id: deviceId, custom_name: { $nin: [null, ""] } })
          .project({ mac: 1, custom_name: 1 })
          .toArray();

        // Separate: keep renamed devices EXCEPT those named "Delete"
        const preservedMacs = [];
        const deletionMarkedMacs = [];
        for (const doc of renamedOverrides) {
          const mac = normalizeMac(doc.mac);
          if (!mac) continue;
          if (String(doc.custom_name || "").trim().toLowerCase() === "delete") {
            deletionMarkedMacs.push(mac);
          } else {
            preservedMacs.push(mac);
          }
        }

        // Delete every client record that isn't in the protected (renamed) set.
        const query =
          preservedMacs.length > 0
            ? { device_id: deviceId, mac: { $nin: preservedMacs } }
            : { device_id: deviceId };

        const result = await connectedClients.deleteMany(query);

        // Also clean up client_overrides for deletion-marked devices
        if (deletionMarkedMacs.length > 0) {
          await clientOverrides.deleteMany({
            device_id: deviceId,
            mac: { $in: deletionMarkedMacs },
          });
        }

        res.json({
          ok: true,
          deletedCount: result.deletedCount,
          preservedCount: preservedMacs.length,
          markedDeletedCount: deletionMarkedMacs.length,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/devices/:id/clients", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const merged = await getMergedClientsSnapshot(
          deviceId,
          connectedClients,
          clientOverrides,
          deviceFilterState,
        );
        res.json(merged);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/devices/:id/mac-filter", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const response = await refreshMacFilterState({
          deviceId,
          managedDevices,
          deviceStatus,
          deviceFilterState,
        });
        res.json(response);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/devices/:id/mac-filter", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const enabled = cleanBoolean(req.body.enabled, null);
        if (enabled == null) {
          return res.status(400).json({ error: "enabled boolean is required" });
        }

        const response = await updateMacFilterMaster({
          deviceId,
          enabled,
          managedDevices,
          deviceStatus,
          deviceFilterState,
        });
        res.json(response);
      } catch (err) {
        res.status(409).json({ error: err.message });
      }
    });

    app.get("/api/devices/:id/port-flap", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) {
          return res.status(400).json({ error: "device id is required" });
        }

        const doc = await devicePortFlap.findOne({ device_id: deviceId });
        res.json(buildPortFlapResponse(deviceId, doc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/devices/:id/port-flap", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) {
          return res.status(400).json({ error: "device id is required" });
        }

        const [existing, statusDoc] = await Promise.all([
          devicePortFlap.findOne({ device_id: deviceId }),
          deviceStatus.findOne({ device_id: deviceId }),
        ]);

        const existingTargets = normalizePortFlapTargets(existing?.targets);
        const nextTargets =
          "targets" in req.body
            ? normalizePortFlapTargets(req.body.targets)
            : existingTargets;
        const nextEnabled =
          "enabled" in req.body
            ? cleanBoolean(req.body.enabled, null)
            : Boolean(existing?.enabled);
        const nextIntensity =
          "intensity" in req.body
            ? cleanPortFlapIntensity(req.body.intensity, null)
            : cleanPortFlapIntensity(existing?.intensity, "light");
        const nextAutoEnabled =
          "auto_enabled" in req.body
            ? cleanBoolean(req.body.auto_enabled, null)
            : Boolean(existing?.auto_enabled);
        const nextAutoConditions =
          "auto_conditions" in req.body
            ? normalizePortFlapAutoConditions(req.body.auto_conditions)
            : normalizePortFlapAutoConditions(existing?.auto_conditions);

        if (nextEnabled == null) {
          return res.status(400).json({ error: "enabled must be a boolean" });
        }
        if (nextAutoEnabled == null) {
          return res.status(400).json({ error: "auto_enabled must be a boolean" });
        }
        if (!nextIntensity) {
          return res.status(400).json({ error: "intensity must be very_light, light, medium, or hard" });
        }
        if (nextEnabled && !hasPortFlapTargets(nextTargets)) {
          return res.status(400).json({ error: "Select at least one LAN or WLAN port before turning on" });
        }

        const existingKeys = portFlapTargetKeys(existingTargets);
        const nextKeys = portFlapTargetKeys(nextTargets);
        const nextKeySet = new Set(nextKeys);
        const removedTargets = portFlapTargetsFromKeys(existingKeys.filter((key) => !nextKeySet.has(key)));
        const existingRestoreStates =
          existing?.restore_states && typeof existing.restore_states === "object"
            ? existing.restore_states
            : {};

        let restoreStates = nextEnabled && !existing?.enabled ? {} : existingRestoreStates;
        let restoreTargets = normalizePortFlapTargets(existing?.restore_targets);

        if (nextEnabled) {
          restoreStates = capturePortFlapRestoreStates(statusDoc, nextKeys, restoreStates);
          restoreTargets = mergePortFlapTargets(restoreTargets, removedTargets);
        } else if (existing?.enabled) {
          restoreTargets = mergePortFlapTargets(restoreTargets, existingTargets, nextTargets);
        }

        const now = new Date().toISOString();
        await devicePortFlap.updateOne(
          { device_id: deviceId },
          {
            $set: {
              device_id: deviceId,
              enabled: nextEnabled,
              intensity: nextIntensity,
              targets: nextTargets,
              auto_enabled: nextAutoEnabled,
              auto_conditions: nextAutoConditions,
              restore_targets: restoreTargets,
              restore_states: restoreStates,
              updated_at: now,
            },
          },
          { upsert: true },
        );

        const latest = await devicePortFlap.findOne({ device_id: deviceId });
        res.json(buildPortFlapResponse(deviceId, latest));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/devices/:id/automation-rules", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) {
          return res.status(400).json({ error: "device id is required" });
        }

        const doc = await deviceAutomationRules.findOne({ device_id: deviceId });
        res.json(buildAutomationRulesResponse(deviceId, doc));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/devices/:id/automation-rules", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) {
          return res.status(400).json({ error: "device id is required" });
        }

        const existing = await deviceAutomationRules.findOne({ device_id: deviceId });
        const inputRules = Array.isArray(req.body) ? req.body : req.body?.rules;
        const rules = normalizeAutomationRules(inputRules, {
          existingRules: existing?.rules,
          resetRuntime: true,
        });

        const now = new Date().toISOString();
        await deviceAutomationRules.updateOne(
          { device_id: deviceId },
          {
            $set: {
              device_id: deviceId,
              rules,
              updated_at: now,
            },
          },
          { upsert: true },
        );

        const latest = await deviceAutomationRules.findOne({ device_id: deviceId });
        res.json(buildAutomationRulesResponse(deviceId, latest));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    function mergeAutomationRules(oldRules, incomingRules) {
      const oldMap = new Map();
      if (Array.isArray(oldRules)) {
        for (const r of oldRules) {
          if (r && r.id) oldMap.set(r.id, r);
        }
      }

      return incomingRules.map(incomingRule => {
        if (!incomingRule || !incomingRule.id) return incomingRule;
        const oldRule = oldMap.get(incomingRule.id);
        
        if (oldRule && !oldRule.enabled && incomingRule.enabled) {
          if (incomingRule.executed) {
            incomingRule.executed = false;
            incomingRule.executed_at = null;
            incomingRule.activated_at = null;
            incomingRule.remaining_seconds = null;
            incomingRule.condition_met_at = null;
            incomingRule._condition_met = false;
          } else if (oldRule.activated_at && oldRule.remaining_seconds != null) {
            const total = (incomingRule.timerMinutes || 1) * 60;
            const elapsedBeforePause = total - oldRule.remaining_seconds;
            incomingRule.activated_at = new Date(Date.now() - (elapsedBeforePause * 1000)).toISOString();
          } else if (oldRule.condition_met_at && oldRule.remaining_seconds != null) {
            const delay = incomingRule.delaySeconds || 0;
            const elapsedBeforePause = delay - oldRule.remaining_seconds;
            incomingRule.condition_met_at = new Date(Date.now() - (elapsedBeforePause * 1000)).toISOString();
          }
        }
        return incomingRule;
      });
    }

    // ── WiFi Schedules ──────────────────────────────────────────────────────
    app.get("/api/devices/:id/wifi-schedules", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const doc = await deviceWifiSchedules.findOne({ device_id: deviceId });
        res.json({ device_id: deviceId, rules: doc?.rules || [], updated_at: doc?.updated_at || null });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch("/api/devices/:id/wifi-schedules", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const incomingRules = Array.isArray(req.body?.rules) ? req.body.rules : Array.isArray(req.body) ? req.body : [];
        const oldDoc = await deviceWifiSchedules.findOne({ device_id: deviceId });
        const mergedRules = mergeAutomationRules(oldDoc?.rules || [], incomingRules);
        const now = new Date().toISOString();
        await deviceWifiSchedules.updateOne({ device_id: deviceId }, { $set: { device_id: deviceId, rules: mergedRules, updated_at: now } }, { upsert: true });
        const latest = await deviceWifiSchedules.findOne({ device_id: deviceId });
        res.json({ device_id: deviceId, rules: latest?.rules || [], updated_at: latest?.updated_at || null });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── LAN Automation ──────────────────────────────────────────────────────
    app.get("/api/devices/:id/lan-automation", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const doc = await deviceLanAutomation.findOne({ device_id: deviceId });
        res.json({ device_id: deviceId, rules: doc?.rules || [], updated_at: doc?.updated_at || null });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch("/api/devices/:id/lan-automation", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const incomingRules = Array.isArray(req.body?.rules) ? req.body.rules : Array.isArray(req.body) ? req.body : [];
        const oldDoc = await deviceLanAutomation.findOne({ device_id: deviceId });
        const mergedRules = mergeAutomationRules(oldDoc?.rules || [], incomingRules);
        const now = new Date().toISOString();
        await deviceLanAutomation.updateOne({ device_id: deviceId }, { $set: { device_id: deviceId, rules: mergedRules, updated_at: now } }, { upsert: true });
        const latest = await deviceLanAutomation.findOne({ device_id: deviceId });
        res.json({ device_id: deviceId, rules: latest?.rules || [], updated_at: latest?.updated_at || null });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Routing Automation ──────────────────────────────────────────────────
    app.get("/api/devices/:id/routing-automation", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const doc = await deviceRoutingAutomation.findOne({ device_id: deviceId });
        res.json({ device_id: deviceId, rules: doc?.rules || [], updated_at: doc?.updated_at || null });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch("/api/devices/:id/routing-automation", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const incomingRules = Array.isArray(req.body?.rules) ? req.body.rules : Array.isArray(req.body) ? req.body : [];
        const oldDoc = await deviceRoutingAutomation.findOne({ device_id: deviceId });
        const mergedRules = mergeAutomationRules(oldDoc?.rules || [], incomingRules);
        const now = new Date().toISOString();
        await deviceRoutingAutomation.updateOne({ device_id: deviceId }, { $set: { device_id: deviceId, rules: mergedRules, updated_at: now } }, { upsert: true });
        const latest = await deviceRoutingAutomation.findOne({ device_id: deviceId });
        res.json({ device_id: deviceId, rules: latest?.rules || [], updated_at: latest?.updated_at || null });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Data Usage ──────────────────────────────────────────────────────────────
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

    function pktDailyKey() {
      const d = new Date(Date.now() + PKT_OFFSET_MS);
      return d.toISOString().slice(0, 10);
    }

    function pktMonthlyKey(billingDay) {
      const d = new Date(Date.now() + PKT_OFFSET_MS);
      const day = d.getUTCDate();
      const hour = d.getUTCHours();
      let year = d.getUTCFullYear();
      let month = d.getUTCMonth();
      const pastReset = day > billingDay || (day === billingDay && hour >= 12);
      if (!pastReset) {
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
      }
      return `${year}-${String(month + 1).padStart(2, "0")}`;
    }

    app.get("/api/devices/:id/data-usage", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });

        const settings = await deviceSettings.findOne({ device_id: deviceId });
        const billingDay = settings?.billing_day || 1;
        const dailyKey = pktDailyKey();
        const monthlyKey = pktMonthlyKey(billingDay);

        const rows = await dataUsage.find({
          device_id: deviceId,
          $or: [
            { period: "daily", period_key: dailyKey },
            { period: "monthly", period_key: monthlyKey },
          ],
        }).toArray();

        const daily = {};
        const monthly = {};
        for (const row of rows) {
          const entry = { bytes_rx: row.bytes_rx || 0, bytes_tx: row.bytes_tx || 0 };
          if (row.period === "daily") daily[row.interface] = entry;
          if (row.period === "monthly") monthly[row.interface] = entry;
        }

        res.json({
          device_id: deviceId,
          billing_day: billingDay,
          daily: { period_key: dailyKey, interfaces: daily },
          monthly: { period_key: monthlyKey, interfaces: monthly },
        });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Device Settings ─────────────────────────────────────────────────────────
    app.get("/api/devices/:id/settings", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const doc = await deviceSettings.findOne({ device_id: deviceId });
        res.json({
          device_id: deviceId,
          billing_day: doc?.billing_day || 1,
          updated_at: doc?.updated_at || null,
        });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch("/api/devices/:id/settings", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        if (!deviceId) return res.status(400).json({ error: "device id is required" });
        const patch = { device_id: deviceId, updated_at: new Date().toISOString() };
        if ("billing_day" in req.body) {
          const day = cleanNumber(req.body.billing_day, 1);
          patch.billing_day = Math.max(1, Math.min(31, day));
        }
        await deviceSettings.updateOne(
          { device_id: deviceId },
          { $set: patch },
          { upsert: true },
        );
        const latest = await deviceSettings.findOne({ device_id: deviceId });
        res.json({
          device_id: deviceId,
          billing_day: latest?.billing_day || 1,
          updated_at: latest?.updated_at || null,
        });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch("/api/devices/:id/clients/:mac", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const mac = normalizeMac(req.params.mac);
        if (!mac) {
          return res.status(400).json({ error: "Valid mac address is required" });
        }

        const [existingOverride, clientRow] = await Promise.all([
          clientOverrides.findOne({ device_id: deviceId, mac }),
          connectedClients.findOne({ device_id: deviceId, mac }),
        ]);

        const patch = {
          device_id: deviceId,
          mac,
          custom_name: "custom_name" in req.body ? cleanString(req.body.custom_name) : existingOverride?.custom_name || null,
          original_name: existingOverride?.original_name || cleanString(clientRow?.hostname),
          is_trusted:
            "is_blocked" in req.body
              ? !cleanBoolean(req.body.is_blocked, false)
              : "is_trusted" in req.body
                ? cleanBoolean(req.body.is_trusted, true)
                : (existingOverride?.is_trusted ?? true),
          block_channel: cleanFilterChannel(
            req.body.block_channel,
            cleanFilterChannel(existingOverride?.block_channel, resolveFilterChannel(clientRow?.interface_type, "wired")),
          ),
          block_sync_status: cleanFilterSyncStatus(existingOverride?.block_sync_status, null),
          block_sync_error: cleanString(existingOverride?.block_sync_error),
          updated_at: new Date().toISOString(),
        };

        const requestedBlocked = patch.is_trusted === false;
        const blockStateChanged =
          "is_blocked" in req.body ||
          "is_trusted" in req.body;

        if (blockStateChanged) {
          patch.block_sync_status = "pending";
          patch.block_sync_error = null;
        }

        await clientOverrides.updateOne(
          { device_id: deviceId, mac },
          { $set: patch },
          { upsert: true },
        );

        if (blockStateChanged) {
          const syncResult = await syncClientBlockState({
            deviceId,
            mac,
            shouldBlock: requestedBlocked,
            interfaceType: clientRow?.interface_type,
            existingOverride: patch,
            managedDevices,
            deviceStatus,
            deviceFilterState,
          });

          patch.block_channel = syncResult.block_channel;
          patch.block_sync_status = syncResult.ok ? "synced" : "failed";
          patch.block_sync_error = syncResult.ok ? null : syncResult.error;

          await clientOverrides.updateOne(
            { device_id: deviceId, mac },
            {
              $set: {
                block_channel: patch.block_channel,
                block_sync_status: patch.block_sync_status,
                block_sync_error: patch.block_sync_error,
                updated_at: new Date().toISOString(),
              },
            },
            { upsert: true },
          );
        }

        const latestOverride = await clientOverrides.findOne({ device_id: deviceId, mac });
        const latestFilterState = await deviceFilterState.findOne({ device_id: deviceId });
        const merged = mergeClientRow(
          clientRow || { device_id: deviceId, mac, recorded_at: null, hostname: null, ip: "", interface_type: null, active: false },
          latestOverride,
          latestFilterState,
        );
        res.json(merged);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/devices/:id/commands", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        const action = cleanString(req.body.action);
        if (!deviceId || !action) {
          return res.status(400).json({ error: "device id and action are required" });
        }

        const payload = {
          action,
          parameter: cleanString(req.body.parameter),
          value: req.body.value == null ? null : String(req.body.value),
          type: cleanString(req.body.type),
        };


        const now = new Date().toISOString();
        const command = {
          device_id: deviceId,
          device_serial: deviceId,
          action,
          payload,
          status: "pending",
          created_at: now,
          updated_at: now,
        };

        const result = await deviceCommands.insertOne(command);
        res.status(201).json({
          id: String(result.insertedId),
          ...command,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete("/api/devices/:id", async (req, res) => {
      try {
        const deviceId = cleanString(req.params.id);
        await Promise.all([
          managedDevices.deleteMany({ device_id: deviceId }),
          deviceStatus.deleteMany({ device_id: deviceId }),
          connectedClients.deleteMany({ device_id: deviceId }),
          clientOverrides.deleteMany({ device_id: deviceId }),
          deviceFilterState.deleteMany({ device_id: deviceId }),
          deviceCommands.deleteMany({ device_id: deviceId }),
          devicePortFlap.deleteMany({ device_id: deviceId }),
        ]);

        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ── SSE REAL-TIME STREAM ────────────────────────────────────────────────
    const sseClients = new Set();
    let sseLastStatusAt  = new Date(Date.now() - 15000).toISOString();
    let sseLastClientsAt = new Date(Date.now() - 60000).toISOString();
    let statusChangeStream = null;
    let clientsChangeStream = null;
    let pollTimer = null;
    let clientsBroadcastQueued = false;

    const CLIENTS_CACHE_TTL_MS = 2_000;
    let clientsCache = null;
    let clientsCacheAt = 0;

    async function getAllMergedClientsSnapshotCached(connectedClients, clientOverrides, deviceFilterState, limit = 150) {
      const now = Date.now();
      if (clientsCache && now - clientsCacheAt < CLIENTS_CACHE_TTL_MS) {
        return clientsCache;
      }
      const rows = await connectedClients
        .find({})
        .sort({ active: -1, recorded_at: -1 })
        .limit(limit)
        .toArray();

      const deviceIds = [...new Set(rows.map((row) => row.device_id).filter(Boolean))];
      const [overrides, filterStates] = await Promise.all([
        clientOverrides.find({ device_id: { $in: deviceIds } }).toArray(),
        deviceFilterState.find({ device_id: { $in: deviceIds } }).toArray(),
      ]);

      const overridesByKey = new Map(
        overrides
          .map((row) => [`${row.device_id}::${normalizeMac(row.mac)}`, row])
          .filter(([key]) => !key.endsWith("::null")),
      );
      const filterStateByDeviceId = new Map(filterStates.map((row) => [row.device_id, row]));

      clientsCache = rows.map((row) =>
        mergeClientRow(
          row,
          overridesByKey.get(`${row.device_id}::${normalizeMac(row.mac)}`),
          filterStateByDeviceId.get(row.device_id),
        ),
      );
      clientsCacheAt = now;
      return clientsCache;
    }

    function broadcastSSE(event, data) {
      const msg = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
      for (const res of sseClients) {
        try { res.write(msg); } catch (_e) { sseClients.delete(res); }
      }
    }

    async function broadcastLatestClients() {
      if (sseClients.size === 0) return;
      const allClients = await getAllMergedClientsSnapshotCached(
        connectedClients,
        clientOverrides,
        deviceFilterState,
        150,
      );
      const newestAt = allClients.length > 0 ? String(allClients[0].recorded_at || "") : "";
      if (newestAt > sseLastClientsAt) {
        broadcastSSE("clients", allClients);
        sseLastClientsAt = newestAt;
      }
    }

    function queueClientsBroadcast() {
      if (clientsBroadcastQueued) return;
      clientsBroadcastQueued = true;
      setImmediate(async () => {
        clientsBroadcastQueued = false;
        try {
          await broadcastLatestClients();
        } catch (_e) {
          // Non-fatal: the next change/poll will retry.
        }
      });
    }

    async function pollSSE() {
      if (sseClients.size === 0) return;
      try {
        const newStatuses = await deviceStatus
          .find({ updated_at: { $gt: sseLastStatusAt } })
          .project({ _id: 0 }).sort({ updated_at: -1 }).limit(10).toArray();
        for (const doc of newStatuses) {
          broadcastSSE("device_status", doc);
          if (doc.updated_at > sseLastStatusAt) sseLastStatusAt = doc.updated_at;
        }

        await broadcastLatestClients();
      } catch (_e) { /* silent */ }
    }

    function startPollingFallback() {
      if (pollTimer) return;
      pollTimer = setInterval(pollSSE, 3000);
      console.warn("SSE fallback polling enabled (3s). Change streams unavailable.");
    }

    function startChangeStreams() {
      try {
        statusChangeStream = deviceStatus.watch([], { fullDocument: "updateLookup" });
        statusChangeStream.on("change", (change) => {
          if (sseClients.size === 0) return;
          const doc = change?.fullDocument;
          if (!doc || typeof doc !== "object") return;
          const payload = withoutMongoId(doc);
          broadcastSSE("device_status", payload);
          if (payload.updated_at && payload.updated_at > sseLastStatusAt) {
            sseLastStatusAt = payload.updated_at;
          }
        });

        clientsChangeStream = db.watch(
          [
            {
              $match: {
                "ns.db": dbName,
                "ns.coll": { $in: ["connected_clients", "client_overrides", "device_filter_state"] },
                operationType: { $in: ["insert", "update", "replace", "delete"] },
              },
            },
          ],
          { fullDocument: "updateLookup" },
        );
        clientsChangeStream.on("change", () => {
          if (sseClients.size === 0) return;
          queueClientsBroadcast();
        });

        const fallbackOnError = () => {
          try { statusChangeStream?.close(); } catch (_e) { /* ignore */ }
          try { clientsChangeStream?.close(); } catch (_e) { /* ignore */ }
          statusChangeStream = null;
          clientsChangeStream = null;
          startPollingFallback();
        };

        statusChangeStream.on("error", fallbackOnError);
        clientsChangeStream.on("error", fallbackOnError);

        console.log("SSE change streams enabled for realtime device + client events");
      } catch (_e) {
        startPollingFallback();
      }
    }

    startChangeStreams();

    app.get("/api/stream", async (req, res) => {
      res.setHeader("Content-Type",      "text/event-stream");
      res.setHeader("Cache-Control",     "no-cache, no-transform");
      res.setHeader("Connection",        "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      sseClients.add(res);
      req.on("close", () => { res.end(); sseClients.delete(res); });

      const ping = setInterval(() => {
        try { res.write(":ping\n\n"); } catch (_e) { clearInterval(ping); }
      }, 25000);
      req.on("close", () => clearInterval(ping));

      try {
        const [snapStatus, snapClients] = await Promise.all([
          deviceStatus.find({}).project({ _id: 0 }).toArray(),
          getAllMergedClientsSnapshotCached(
            connectedClients,
            clientOverrides,
            deviceFilterState,
            150,
          ),
        ]);
        if (snapStatus.length  > 0)
          res.write("event: device_status\ndata: " + JSON.stringify(snapStatus[0])  + "\n\n");
        if (snapClients.length > 0)
          res.write("event: clients\ndata: "       + JSON.stringify(snapClients) + "\n\n");
      } catch (_e) { /* non-fatal */ }
    });
    // ────────────────────────────────────────────────────────────────────────

    require("./unified_solar_routes.js").registerUnifiedSolarRoutes(app, client.db(dbName));

    app.listen(port, () => {
      console.log(`API Server running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exitCode = 1;
  }
}

startServer();

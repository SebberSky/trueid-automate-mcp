import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unsupported } from "./errors.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = join(root, "docs/contracts/capability-registry-v1.json");

/** @type {import('../types.js').CapabilityRegistry | null} */
let cached = null;

export function loadCapabilityRegistry() {
  if (!cached) {
    cached = JSON.parse(readFileSync(registryPath, "utf8"));
  }
  return cached;
}

/**
 * @param {string} platform
 * @param {string} action
 */
export function assertSupported(platform, action) {
  const registry = loadCapabilityRegistry();
  const platformEntry = registry.platforms[platform];
  if (!platformEntry) {
    throw unsupported(action, platform);
  }
  const exact = platformEntry.actions?.[action];
  if (exact?.support === "supported") {
    return exact;
  }
  if (exact?.support === "unsupported") {
    throw unsupported(action, platform);
  }
  const star = platformEntry.actions?.["*"];
  if (star?.support === "unsupported") {
    throw unsupported(action, platform);
  }
  throw unsupported(action, platform);
}

/**
 * @param {string} [platform]
 */
export function getCapabilities(platform) {
  const registry = loadCapabilityRegistry();
  if (!platform) {
    return registry;
  }
  const entry = registry.platforms[platform];
  if (!entry) {
    return { version: registry.version, platform, found: false };
  }
  return {
    version: registry.version,
    platform,
    found: true,
    ...entry,
  };
}

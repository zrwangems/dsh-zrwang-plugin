import fs from "node:fs";
import path from "node:path";

/**
 * School configuration is shipped with the skill; the DSH plugin fixes it to
 * BUAA and injects `LIT_DL_SCHOOL_FILE`. No file is ever written at runtime.
 */
export const DEFAULT_DISCOVERY_URL = "https://www.webofscience.com/wos/woscc/basic-search";

export function configPathFromEnv(env = process.env) {
  if (env.DSH_ZRWANG_LIT_DL_SCHOOL_FILE) return env.DSH_ZRWANG_LIT_DL_SCHOOL_FILE;
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "config", "school.json");
}

export function loadSchoolConfig(env = process.env) {
  const file = configPathFromEnv(env);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function discoveryUrlFromConfig(config) {
  return (
    config?.discovery?.web_of_science_url ||
    config?.discovery?.wos_url ||
    config?.discovery?.url ||
    DEFAULT_DISCOVERY_URL
  );
}

export function schoolSummary(config) {
  if (!config) return "unconfigured";
  const school = config.school?.name || "unknown school";
  const auth = config.auth?.type || "unknown auth";
  return `${school} (${auth})`;
}

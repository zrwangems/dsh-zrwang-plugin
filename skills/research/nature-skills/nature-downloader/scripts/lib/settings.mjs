import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function settingsPathFromEnv(env = process.env) {
  const dir = env.LIT_DL_CONFIG_DIR || path.join(os.homedir(), ".dsh", "zrwang-plugin-config", "nature-downloader");
  return path.join(dir, "settings.json");
}

export function loadSettings(env = process.env) {
  const file = settingsPathFromEnv(env);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch {
    return {};
  }
}

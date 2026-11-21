import { PUBLISHER_PROVIDERS } from "./provider-registry.mjs";

const PROVIDERS = new Set(PUBLISHER_PROVIDERS);

/**
 * Credentials come only from the DSH plugin settings, injected as `_CRED`
 * environment variables. The skill has no credentials file and never writes one.
 */
const ENV = {
  elsevier: {
    api_key: "DSH_ZRWANG_ELSEVIER_CRED",
    insttoken: "DSH_ZRWANG_ELSEVIER_INST_CRED",
    authtoken: "DSH_ZRWANG_ELSEVIER_AUTH_CRED",
  },
  springer_nature: {
    fulltext_api_key: "DSH_ZRWANG_SPRINGER_FULLTEXT_CRED",
    openaccess_api_key: "DSH_ZRWANG_SPRINGER_OA_CRED",
    metadata_api_key: "DSH_ZRWANG_SPRINGER_METADATA_CRED",
  },
  ieee: {
    api_key: "DSH_ZRWANG_IEEE_CRED",
    fulltext_endpoint: "DSH_ZRWANG_IEEE_FULLTEXT_ENDPOINT",
  },
};

function assertProvider(provider) {
  if (!PROVIDERS.has(provider)) throw new Error(`unsupported provider: ${provider}`);
}

export function providerCredentials(provider, env = process.env) {
  assertProvider(provider);
  const mapping = ENV[provider] ?? {};
  const values = {};
  for (const [field, name] of Object.entries(mapping)) {
    const value = typeof env[name] === "string" ? env[name].trim() : "";
    if (value) values[field] = value;
  }
  return Object.keys(values).length > 0 ? values : null;
}

/** 只用于展示：永远不会回显完整密钥。 */
export function maskSecret(value = "") {
  const text = String(value);
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
}

export function maskedCredentials(env = process.env) {
  const all = {};
  for (const provider of PROVIDERS) {
    const values = providerCredentials(provider, env);
    if (values === null) continue;
    all[provider] = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, maskSecret(value)]));
  }
  return all;
}

/** 上游 CLI 里的写入入口：本插件不允许技能写凭据文件。 */
export function saveProviderCredentials() {
  throw new Error("Publisher credentials are configured in DSH plugin settings; this skill does not write credential files.");
}

export function deleteProviderCredentials() {
  throw new Error("Publisher credentials are configured in DSH plugin settings; this skill does not write credential files.");
}

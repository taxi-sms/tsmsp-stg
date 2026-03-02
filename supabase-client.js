import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_SUPABASE_URL = "https://gsvehqeywmjqlvuzwvuo.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_PCpsmoo77V5L0YQfT2yKnA_QCEFpARJ";
const CONFIG_KEY = "tsms_supabase_config";
const DEFAULT_CONFIG = Object.freeze({
  url: DEFAULT_SUPABASE_URL,
  anonKey: DEFAULT_SUPABASE_ANON_KEY
});

function sanitize(v) {
  return String(v || "").trim().replace(/[\r\n]/g, "");
}

function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null") || {};
  } catch (_) {
    cfg = {};
  }

  const loaded = {
    url: sanitize(cfg.url || DEFAULT_SUPABASE_URL),
    anonKey: sanitize(cfg.anonKey || DEFAULT_SUPABASE_ANON_KEY)
  };
  const shouldForceDefault = loaded.url !== DEFAULT_SUPABASE_URL || loaded.anonKey !== DEFAULT_SUPABASE_ANON_KEY;
  if (shouldForceDefault) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }
  return loaded;
}

const config = loadConfig();
const supabase = createClient(config.url, config.anonKey);

export { CONFIG_KEY, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, loadConfig, sanitize, supabase };

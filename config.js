// ── Token Gauge Config ───────────────────────────────────
// Persists user toggles: autotrack on/off, weekly mode, weekly budget.
// Stored in config.json next to session.json.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  autotrack: false,
  weeklyMode: false,
  weeklyBudget: 10_000_000, // 10M tokens/week default
  contextMax: 200_000,
  weeklyResetDay: 1,        // 1=Monday (JS getDay: 0=Sun)
  weeklyResetHourUtc: 20,   // 20:00 UTC = 4pm EDT
};

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function setConfig(key, value) {
  const cfg = loadConfig();
  cfg[key] = value;
  saveConfig(cfg);
  return cfg;
}

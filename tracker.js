import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, 'session.json');

function createEmptySession() {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    promptCount: 0,
    promptLog: [],
    sessionStart: new Date().toISOString(),
  };
}

export function loadSession() {
  if (!existsSync(SESSION_FILE)) {
    return createEmptySession();
  }
  try {
    const data = readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return createEmptySession();
  }
}

export function saveSession(session) {
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

export function resetSession() {
  const session = createEmptySession();
  saveSession(session);
  return session;
}

export function recordPrompt(session, inputTokens, outputTokens, mode, opts = {}) {
  session.totalInputTokens += inputTokens;
  session.totalOutputTokens += outputTokens;
  session.promptCount += 1;

  const total = inputTokens + outputTokens;
  const cumulative = session.totalInputTokens + session.totalOutputTokens;

  const entry = {
    index: session.promptCount,
    inputTokens,
    outputTokens,
    total,
    cumulative,
    mode,
    estimated: mode === 'estimate',
    timestamp: new Date().toISOString(),
  };

  if (opts.label) entry.label = opts.label;

  session.promptLog.push(entry);

  // Keep last 10 entries
  if (session.promptLog.length > 10) {
    session.promptLog = session.promptLog.slice(-10);
  }

  saveSession(session);
  return session;
}

export function getTotalTokens(session) {
  return session.totalInputTokens + session.totalOutputTokens;
}

export function getAvgTokensPerPrompt(session) {
  if (session.promptCount === 0) return 0;
  return Math.round(getTotalTokens(session) / session.promptCount);
}

export function getPromptsLeft(session, maxTokens) {
  const avg = getAvgTokensPerPrompt(session);
  if (avg === 0) return Infinity;
  const remaining = maxTokens - getTotalTokens(session);
  return Math.max(0, Math.floor(remaining / avg));
}

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, 'session.json');

// ── Session schema ─────────────────────────────────────────
// Context tank tracks the CURRENT Claude session only (whichever
// transcript has the most recent activity). Weekly tank tracks a
// rolling 7-day aggregate across all sessions. Lifetime totals
// accumulate forever.

function createEmptySession() {
  return {
    // Lifetime totals (all activity, ever)
    totalInputTokens: 0,
    totalOutputTokens: 0,
    promptCount: 0,

    // Current claude session — drives the CONTEXT TANK gauge
    currentSessionId: null,
    currentSessionInput: 0,         // cumulative input across the session (for MPT avg)
    currentSessionOutput: 0,
    currentSessionPrompts: 0,
    currentContextSize: 0,          // size of the LIVE context window (last turn's input total)
    currentSessionStartedAt: null,
    currentSessionLastSeen: null,

    // Per-session running totals so backfill can pick the
    // most recent as "current" without re-scanning files.
    sessions: {},

    // Weekly tank
    weekStart: null,
    weeklyUsedInput: 0,
    weeklyUsedOutput: 0,

    // Recent prompt log (last 20)
    promptLog: [],

    // Settings
    maxTokens: null,
    sessionStart: new Date().toISOString(),
  };
}

export function loadSession() {
  if (!existsSync(SESSION_FILE)) {
    return createEmptySession();
  }
  try {
    const data = readFileSync(SESSION_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Merge with defaults so old sessions get new fields
    return { ...createEmptySession(), ...parsed };
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

export function setMaxTokens(session, maxTokens) {
  session.maxTokens = maxTokens;
  saveSession(session);
  return session;
}

// ── Manual mode entry point (live/manual/estimate modes) ──
// Manual prompts are treated as the "current session" since they
// represent the user actively interacting with the gauge.
export function recordPrompt(session, inputTokens, outputTokens, mode, opts = {}) {
  session.totalInputTokens += inputTokens;
  session.totalOutputTokens += outputTokens;
  session.promptCount += 1;

  // Manual entries flow into the current context tank
  session.currentSessionId = session.currentSessionId || `manual-${Date.now()}`;
  session.currentSessionInput += inputTokens;
  session.currentSessionOutput += outputTokens;
  session.currentSessionPrompts += 1;
  session.currentContextSize = inputTokens; // last turn drives context fill
  session.currentSessionStartedAt = session.currentSessionStartedAt || new Date().toISOString();
  session.currentSessionLastSeen = new Date().toISOString();

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
  if (session.promptLog.length > 20) {
    session.promptLog = session.promptLog.slice(-20);
  }

  saveSession(session);
  return session;
}

// ── Lifetime metrics ────────────────────────────────────────
export function getTotalTokens(session) {
  return session.totalInputTokens + session.totalOutputTokens;
}

export function getAvgTokensPerPrompt(session) {
  // Use current session for MPT — that's what's relevant to the user
  // right now. Falls back to lifetime if no current session yet.
  const prompts = session.currentSessionPrompts || session.promptCount;
  if (prompts === 0) return 0;
  const tokens = (session.currentSessionInput + session.currentSessionOutput) || getTotalTokens(session);
  return Math.round(tokens / prompts);
}

// ── Context tank metrics (current session only) ────────────
// Context tank fill = the LATEST turn's input total (cache reads
// represent context that's still in the window). It is NOT
// cumulative input across the session — that overcounts cache reads.
export function getContextTokens(session) {
  return session.currentContextSize || 0;
}

export function getContextPromptsLeft(session, maxTokens) {
  const avg = getAvgTokensPerPrompt(session);
  if (avg === 0) return Infinity;
  const remaining = maxTokens - getContextTokens(session);
  return Math.max(0, Math.floor(remaining / avg));
}

// ── Weekly tank metrics ────────────────────────────────────
export function getWeeklyTokens(session) {
  return (session.weeklyUsedInput || 0) + (session.weeklyUsedOutput || 0);
}

// Returns the most recent Monday at 00:00 local time as ISO string.
export function getMostRecentMonday(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Resets weekly counters if past the week boundary.
export function rolloverWeekIfNeeded(session) {
  const now = new Date();
  const monday = getMostRecentMonday(now);
  if (!session.weekStart || new Date(session.weekStart).getTime() < new Date(monday).getTime()) {
    session.weekStart = monday;
    session.weeklyUsedInput = 0;
    session.weeklyUsedOutput = 0;
  }
  return session;
}

// Legacy export for any old import sites
export function getPromptsLeft(session, maxTokens) {
  return getContextPromptsLeft(session, maxTokens);
}

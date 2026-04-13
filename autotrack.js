// ── Token Gauge Auto-Tracker ─────────────────────────────
// Watches Claude Code JSONL transcripts in ~/.claude/projects/
// and automatically logs token usage to session.json.
//
// Usage:
//   node autotrack.js --backfill        Scan all existing transcripts once
//   node autotrack.js --watch           Run as a daemon, watching for new turns
//   node autotrack.js --status          Show daemon status

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { loadSession, saveSession, rolloverWeekIfNeeded } from './tracker.js';
import { loadConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const COWORK_DIR = join(homedir(), 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions');
const WATERMARK_FILE = join(__dirname, 'autotrack-watermarks.json');

// ── Watermark tracking ───────────────────────────────────
// Tracks the byte offset already processed for each JSONL file
// so we never double-count on rescan.

function loadWatermarks() {
  if (!existsSync(WATERMARK_FILE)) return {};
  try {
    return JSON.parse(readFileSync(WATERMARK_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveWatermarks(marks) {
  writeFileSync(WATERMARK_FILE, JSON.stringify(marks, null, 2));
}

// ── Find all JSONL transcript files ──────────────────────

// Recursively collect all .jsonl files under a directory (max depth to avoid runaway).
function collectJsonl(dir, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isFile() && entry.endsWith('.jsonl')) {
      results.push(full);
    } else if (stat.isDirectory()) {
      results.push(...collectJsonl(full, maxDepth, depth + 1));
    }
  }
  return results;
}

function findTranscripts() {
  const files = [];

  // Claude Code — ~/.claude/projects/<project>/<sessionId>.jsonl (depth 2)
  if (existsSync(PROJECTS_DIR)) {
    files.push(...collectJsonl(PROJECTS_DIR, 2));
  }

  // Claude Cowork — deeply nested JSONL in local-agent-mode-sessions (depth 8)
  if (existsSync(COWORK_DIR)) {
    files.push(...collectJsonl(COWORK_DIR, 8));
  }

  return files;
}

// Derive a sessionId from the file path. For Cowork audit.jsonl files
// we include the parent UUID to avoid collisions across sessions.
function sessionIdFromPath(p) {
  const parts = p.split('/');
  const base = parts.pop() || p;
  const name = base.replace(/\.jsonl$/, '');
  // Cowork audit files: local_<uuid>/audit.jsonl → "cowork-<uuid>"
  if (name === 'audit' && parts.length > 0) {
    const parent = parts.pop() || '';
    const id = parent.replace(/^local_/, '');
    return `cowork-${id}`;
  }
  return name;
}

// ── Parse a single JSONL line and extract usage ──────────
// Claude Code stores usage on assistant messages. Each line is one event.

function parseUsageFromLine(line, fallbackSessionId) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }

  if (obj.type !== 'assistant' || !obj.message?.usage) return null;

  const u = obj.message.usage;
  // inputTokens = full turn size (for CONTEXT TANK — the live window fill)
  const inputTokens =
    (u.input_tokens || 0) +
    (u.cache_creation_input_tokens || 0) +
    (u.cache_read_input_tokens || 0);
  // billableInput = tokens that count against the weekly cap
  // (cache reads are ~free and don't consume your weekly budget)
  const billableInput =
    (u.input_tokens || 0) +
    (u.cache_creation_input_tokens || 0);
  const outputTokens = u.output_tokens || 0;

  if (inputTokens === 0 && outputTokens === 0) return null;

  return {
    inputTokens,
    billableInput,
    outputTokens,
    timestamp: obj.timestamp || new Date().toISOString(),
    sessionId: obj.sessionId || fallbackSessionId,
    source: null, // caller fills in based on file path
    model: obj.message?.model || null,
  };
}

// ── Process new content in a file from a given byte offset ──

function processFile(filePath, fromOffset) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return { newOffset: fromOffset, entries: [] };
  }

  const newContent = content.slice(fromOffset);
  if (!newContent) return { newOffset: fromOffset, entries: [] };

  // Last line may be incomplete if file is being written; only process
  // through the last newline.
  const lastNewlineIdx = newContent.lastIndexOf('\n');
  const completeContent = lastNewlineIdx >= 0 ? newContent.slice(0, lastNewlineIdx + 1) : '';
  const completeLines = completeContent.split('\n').filter((l) => l);

  const fallbackSessionId = sessionIdFromPath(filePath);
  const isCowork = filePath.includes('local-agent-mode-sessions');
  const entries = [];
  for (const line of completeLines) {
    const usage = parseUsageFromLine(line, fallbackSessionId);
    if (usage) {
      usage.source = isCowork ? 'cowork' : 'claude-code';
      entries.push(usage);
    }
  }

  return {
    newOffset: fromOffset + Buffer.byteLength(completeContent, 'utf-8'),
    entries,
  };
}

// ── Apply entries to session.json ────────────────────────
// Groups entries by sessionId, updates per-session running totals,
// lifetime totals, weekly aggregate, and picks the most recent
// session as the "current" context tank.

function applyEntries(entries) {
  if (entries.length === 0) return null;

  let session = loadSession();
  rolloverWeekIfNeeded(session);

  const cfg = loadConfig();
  const weeklyOn = cfg.weeklyMode;
  const weekStartMs = session.weekStart ? new Date(session.weekStart).getTime() : 0;

  let added = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (const e of entries) {
    // Lifetime
    session.totalInputTokens += e.inputTokens;
    session.totalOutputTokens += e.outputTokens;
    session.promptCount += 1;
    added++;
    totalIn += e.inputTokens;
    totalOut += e.outputTokens;

    // Per-session bucket
    const sid = e.sessionId || 'unknown';
    if (!session.sessions[sid]) {
      session.sessions[sid] = {
        input: 0,
        output: 0,
        prompts: 0,
        lastContextInput: 0,
        firstSeen: e.timestamp,
        lastSeen: e.timestamp,
      };
    }
    const bucket = session.sessions[sid];
    bucket.input += e.inputTokens;
    bucket.output += e.outputTokens;
    bucket.prompts += 1;
    // Track the latest turn's input total — that's the live context fill
    if (e.timestamp >= bucket.lastSeen) {
      bucket.lastSeen = e.timestamp;
      bucket.lastContextInput = e.inputTokens;
    }
    if (e.timestamp < bucket.firstSeen) bucket.firstSeen = e.timestamp;

    // Weekly tank — only entries within the current week count.
    // Use billableInput (excludes cache reads) to match Anthropic's
    // weekly cap semantics.
    if (weeklyOn && new Date(e.timestamp).getTime() >= weekStartMs) {
      session.weeklyUsedInput = (session.weeklyUsedInput || 0) + (e.billableInput || 0);
      session.weeklyUsedOutput = (session.weeklyUsedOutput || 0) + e.outputTokens;
    }

    // Detect source from sessionId / path context
    const source = e.source || 'claude-code';

    // Append to prompt log (we'll trim after)
    session.promptLog.push({
      index: session.promptCount,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      total: e.inputTokens + e.outputTokens,
      cumulative: session.totalInputTokens + session.totalOutputTokens,
      mode: 'autotrack',
      estimated: false,
      timestamp: e.timestamp,
      source,
      model: e.model,
      sessionId: sid,
    });
  }

  // Pick the most-recently-active session as the current context tank
  let mostRecent = null;
  let mostRecentTs = '';
  for (const [sid, b] of Object.entries(session.sessions)) {
    if (b.lastSeen > mostRecentTs) {
      mostRecentTs = b.lastSeen;
      mostRecent = sid;
    }
  }
  if (mostRecent) {
    const b = session.sessions[mostRecent];
    session.currentSessionId = mostRecent;
    session.currentSessionInput = b.input;
    session.currentSessionOutput = b.output;
    session.currentSessionPrompts = b.prompts;
    session.currentContextSize = b.lastContextInput;
    session.currentSessionStartedAt = b.firstSeen;
    session.currentSessionLastSeen = b.lastSeen;
  }

  // Trim prompt log
  if (session.promptLog.length > 20) {
    session.promptLog = session.promptLog.slice(-20);
  }

  saveSession(session);
  return { added, totalIn, totalOut };
}

// ── BACKFILL: scan all existing transcripts once ─────────

export function backfill() {
  const files = findTranscripts();
  const watermarks = loadWatermarks();
  let totalEntries = 0;
  let totalIn = 0;
  let totalOut = 0;

  console.log(`Scanning ${files.length} transcript files...`);

  // Sort by mtime so the most recently active file is processed last
  const sorted = files
    .map((f) => {
      try {
        return { f, mtime: statSync(f).mtimeMs };
      } catch {
        return { f, mtime: 0 };
      }
    })
    .sort((a, b) => a.mtime - b.mtime)
    .map((x) => x.f);

  for (const file of sorted) {
    const fromOffset = watermarks[file] || 0;
    const { newOffset, entries } = processFile(file, fromOffset);
    if (entries.length > 0) {
      const result = applyEntries(entries);
      if (result) {
        totalEntries += result.added;
        totalIn += result.totalIn;
        totalOut += result.totalOut;
      }
    }
    watermarks[file] = newOffset;
  }

  saveWatermarks(watermarks);

  return { files: files.length, entries: totalEntries, totalIn, totalOut };
}

// ── WATCH: keep running and process new content as it appears ──

export function startWatcher() {
  console.log(`Auto-tracker watching ${PROJECTS_DIR}`);
  console.log('Press Ctrl+C to stop.\n');

  const result = backfill();
  console.log(`Initial scan: ${result.entries} new entries from ${result.files} files`);
  console.log(`  Input: ${result.totalIn.toLocaleString()} tokens`);
  console.log(`  Output: ${result.totalOut.toLocaleString()} tokens\n`);

  let lastCheck = Date.now();
  setInterval(() => {
    const watermarks = loadWatermarks();
    const files = findTranscripts();
    let newCount = 0;

    for (const file of files) {
      let stat;
      try {
        stat = statSync(file);
      } catch {
        continue;
      }
      if (stat.mtimeMs < lastCheck - 5000) continue;

      const fromOffset = watermarks[file] || 0;
      if (stat.size <= fromOffset) continue;

      const { newOffset, entries } = processFile(file, fromOffset);
      if (entries.length > 0) {
        const result = applyEntries(entries);
        if (result) newCount += result.added;
        watermarks[file] = newOffset;
      }
    }

    if (newCount > 0) {
      saveWatermarks(watermarks);
      const ts = new Date().toLocaleTimeString();
      console.log(`[${ts}] Logged ${newCount} new turn(s)`);
    }

    lastCheck = Date.now();
  }, 3000);
}

// ── CLI entry point ──────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--backfill')) {
    const r = backfill();
    console.log(`✓ Backfill complete: ${r.entries} entries from ${r.files} transcripts`);
    console.log(`  Input:  ${r.totalIn.toLocaleString()} tokens`);
    console.log(`  Output: ${r.totalOut.toLocaleString()} tokens`);
    console.log(`  Total:  ${(r.totalIn + r.totalOut).toLocaleString()} tokens`);
  } else if (args.includes('--watch')) {
    startWatcher();
  } else {
    console.log('Usage: node autotrack.js --backfill | --watch');
  }
}

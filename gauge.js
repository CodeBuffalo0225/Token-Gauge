import chalk from 'chalk';
import Table from 'cli-table3';
import { getTotalTokens, getAvgTokensPerPrompt, getPromptsLeft } from './tracker.js';

// ── Semicircle arc layout ──────────────────────────────────
//
//        ╱ ─ ─ ─ ╲          11 positions along the arc
//      ╱     |     ╲        Needle (●) placed at one position
//    │       |       │      Fill uses bold/color, remainder dim
//    E               F
//
// Positions map to fractions 0.0 → 1.0 left-to-right

const ARC_TEMPLATE = [
  //  row 0 (top):       positions 3,4,5,6,7
  //  row 1 (mid-upper): positions 2 and 8
  //  row 2 (mid-lower): positions 1 and 9
  //  row 3 (bottom):    positions 0 and 10
];

// Each slot: [row, col-offset-from-center, character]
const ARC_SLOTS = [
  { row: 3, col: -10, ch: '│' },  // pos 0  (far left)
  { row: 2, col: -8,  ch: '╱' },  // pos 1
  { row: 1, col: -6,  ch: '╱' },  // pos 2
  { row: 0, col: -4,  ch: '─' },  // pos 3
  { row: 0, col: -2,  ch: '─' },  // pos 4
  { row: 0, col: 0,   ch: '─' },  // pos 5  (top center)
  { row: 0, col: 2,   ch: '─' },  // pos 6
  { row: 0, col: 4,   ch: '─' },  // pos 7
  { row: 1, col: 6,   ch: '╲' },  // pos 8
  { row: 2, col: 8,   ch: '╲' },  // pos 9
  { row: 3, col: 10,  ch: '│' },  // pos 10 (far right)
];

const TOTAL_SLOTS = ARC_SLOTS.length; // 11
const ARC_ROWS = 4;
const ARC_HALF_WIDTH = 12; // chars from center to edge
const ARC_FULL_WIDTH = ARC_HALF_WIDTH * 2 + 1; // 25

function formatNum(n) {
  if (n === Infinity) return '∞';
  if (n >= 1000) return n.toLocaleString('en-US');
  return String(n);
}

function shortNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}

function buildSemicircle(fraction, colorFn) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const needlePos = Math.round(clamped * (TOTAL_SLOTS - 1));

  // Build a 4-row × ARC_FULL_WIDTH grid of spaces
  const grid = [];
  for (let r = 0; r < ARC_ROWS; r++) {
    grid.push(new Array(ARC_FULL_WIDTH).fill(' '));
  }

  // Place each slot character
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = ARC_SLOTS[i];
    const col = ARC_HALF_WIDTH + slot.col;
    if (i === needlePos) {
      grid[slot.row][col] = chalk.white.bold('●');
    } else if (i < needlePos) {
      // Filled (before needle)
      grid[slot.row][col] = colorFn(slot.ch);
    } else {
      // Empty (after needle)
      grid[slot.row][col] = chalk.gray(slot.ch);
    }
  }

  return grid.map((row) => row.join(''));
}

function tankColor(pct) {
  if (pct < 0.5) return chalk.green;
  if (pct < 0.75) return chalk.yellow;
  return chalk.red;
}

function mptColor(avg) {
  if (avg <= 1000) return chalk.blue;
  if (avg <= 3000) return chalk.yellow;
  return chalk.red;
}

function mptLabel(avg) {
  if (avg <= 1000) return chalk.blue('EFFICIENT');
  if (avg <= 3000) return chalk.yellow('MODERATE');
  return chalk.red('HEAVY');
}

function centerText(text, width) {
  const raw = text.replace(/\x1B\[[0-9;]*m/g, '');
  const pad = Math.max(0, width - raw.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function boxLine(content, width) {
  const raw = content.replace(/\x1B\[[0-9;]*m/g, '');
  const pad = Math.max(0, width - raw.length);
  return '║ ' + content + ' '.repeat(pad) + ' ║';
}

export function renderDashboard(session, maxTokens) {
  const total = getTotalTokens(session);
  const pct = total / maxTokens;
  const avg = getAvgTokensPerPrompt(session);
  const left = getPromptsLeft(session, maxTokens);

  const BOX_INNER = ARC_FULL_WIDTH + 2; // content width inside box
  const BOX_OUTER = BOX_INNER + 4;      // with ║ + space on each side

  // ── CONTEXT TANK (fills left→right: 0% = left, 100% = right) ──
  const tankArc = buildSemicircle(pct, tankColor(pct));
  const tankTitle = ' CONTEXT TANK ';
  const tankBorderLen = Math.max(0, Math.floor((BOX_INNER - tankTitle.length) / 2));
  const tankTopBorder = '═'.repeat(tankBorderLen);
  const tankTopExtra = '═'.repeat(BOX_INNER - tankBorderLen * 2 - tankTitle.length);

  // ── MPT GAUGE (inverted: high MPT = left, low MPT = right) ──
  // Invert: fraction = 1 - (avg / max) so heavy usage fills LEFT
  const mptMax = 5000;
  const mptFrac = 1 - Math.min(1, avg / mptMax);
  const mptArc = buildSemicircle(mptFrac, mptColor(avg));
  const mptTitle = ' EFFICIENCY (MPT) ';
  const mptBorderLen = Math.max(0, Math.floor((BOX_INNER - mptTitle.length) / 2));
  const mptTopBorder = '═'.repeat(mptBorderLen);
  const mptTopExtra = '═'.repeat(BOX_INNER - mptBorderLen * 2 - mptTitle.length);

  // Render side-by-side
  const lines = [''];

  // Top borders
  lines.push(
    `  ╔${tankTopBorder}${tankTitle}${tankTopBorder}${tankTopExtra}╗` +
    `   ╔${mptTopBorder}${mptTitle}${mptTopBorder}${mptTopExtra}╗`
  );

  // Arc rows
  for (let r = 0; r < ARC_ROWS; r++) {
    lines.push(
      `  ║ ${tankArc[r]} ║` +
      `   ║ ${mptArc[r]} ║`
    );
  }

  // Labels row (E/F for tank, 5k/500 for MPT)
  const tankLabels = centerText('E' + ' '.repeat(ARC_FULL_WIDTH - 2) + 'F', BOX_INNER);
  // MPT is inverted: heavy (5k) on LEFT, efficient (500) on RIGHT
  const mptLabels = centerText('5k' + ' '.repeat(ARC_FULL_WIDTH - 4) + '500', BOX_INNER);
  lines.push(
    `  ║ ${tankLabels} ║` +
    `   ║ ${mptLabels} ║`
  );

  // Value rows
  const tankVal = centerText(`${formatNum(total)} / ${shortNum(maxTokens)}`, BOX_INNER);
  const mptVal = centerText(`avg ${formatNum(avg)} tok/prompt`, BOX_INNER);
  lines.push(
    `  ║ ${tankVal} ║` +
    `   ║ ${mptVal} ║`
  );

  const tankPct = centerText(`${(pct * 100).toFixed(1)}%`, BOX_INNER);
  const mptLbl = centerText(mptLabel(avg), BOX_INNER);
  lines.push(
    `  ║ ${tankPct} ║` +
    `   ║ ${mptLbl} ║`
  );

  // Bottom borders
  lines.push(
    `  ╚${'═'.repeat(BOX_INNER + 2)}╝` +
    `   ╚${'═'.repeat(BOX_INNER + 2)}╝`
  );

  console.log(lines.join('\n'));

  // ── METRICS STRIP ──
  const tankLevel = pct < 0.25 ? 'Plenty left' : pct < 0.5 ? 'Good shape' : pct < 0.75 ? 'Getting low' : 'Running out';

  const metricsTable = new Table({
    chars: {
      top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
      right: '│', 'right-mid': '┤', middle: '│',
    },
    colWidths: [16, 16, 16, 16],
    colAligns: ['center', 'center', 'center', 'center'],
  });

  metricsTable.push(
    [chalk.bold('Tokens Used'), chalk.bold('Tank Level'), chalk.bold('Tokens/Prompt'), chalk.bold('Prompts Left')],
    [formatNum(total), `${(pct * 100).toFixed(1)}%`, formatNum(avg), formatNum(left)],
    [`of ${shortNum(maxTokens)} ctx`, tankLevel, 'avg per msg', 'est. at avg'],
  );

  console.log('\n' + metricsTable.toString());

  // ── PROMPT LOG ──
  const recentPrompts = session.promptLog.slice(-5);
  if (recentPrompts.length > 0) {
    const logTable = new Table({
      chars: {
        top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
        right: '│', 'right-mid': '┤', middle: '│',
      },
      colWidths: [5, 12, 12, 12, 14, 10],
      colAligns: ['center', 'center', 'center', 'center', 'center', 'center'],
    });

    logTable.push(
      [chalk.bold('#'), chalk.bold('Tokens ↑'), chalk.bold('Tokens ↓'), chalk.bold('Total'), chalk.bold('Running'), chalk.bold('Mode')],
    );

    for (const entry of [...recentPrompts].reverse()) {
      logTable.push([
        entry.index,
        entry.estimated ? chalk.dim(`~${formatNum(entry.inputTokens)}`) : formatNum(entry.inputTokens),
        entry.estimated ? chalk.dim(`~${formatNum(entry.outputTokens)}`) : formatNum(entry.outputTokens),
        entry.estimated ? chalk.dim(`~${formatNum(entry.total)}`) : formatNum(entry.total),
        formatNum(entry.cumulative),
        entry.mode || 'live',
      ]);
    }

    console.log('\n' + logTable.toString());
  }

  console.log('');
}

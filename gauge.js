import chalk from 'chalk';
import Table from 'cli-table3';
import { getTotalTokens, getAvgTokensPerPrompt, getPromptsLeft } from './tracker.js';

const ARC_WIDTH = 20;

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

function buildArc(fraction, filledColor) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filledCount = Math.round(clamped * ARC_WIDTH);
  const emptyCount = ARC_WIDTH - filledCount;

  let arc = '';
  if (filledCount > 0 && filledCount < ARC_WIDTH) {
    arc += filledColor('█'.repeat(filledCount));
    arc += chalk.white('▲');
    arc += chalk.gray('░'.repeat(emptyCount - 1));
  } else if (filledCount >= ARC_WIDTH) {
    arc = filledColor('█'.repeat(ARC_WIDTH - 1)) + chalk.white('▲');
  } else {
    arc = chalk.white('▲') + chalk.gray('░'.repeat(ARC_WIDTH - 1));
  }
  return arc;
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

function pad(str, len) {
  const raw = str.replace(/\x1B\[[0-9;]*m/g, '');
  const diff = len - raw.length;
  if (diff <= 0) return str;
  const left = Math.floor(diff / 2);
  const right = diff - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

export function renderDashboard(session, maxTokens) {
  const total = getTotalTokens(session);
  const pct = total / maxTokens;
  const avg = getAvgTokensPerPrompt(session);
  const left = getPromptsLeft(session, maxTokens);

  // --- TANK GAUGE ---
  const tankW = 28;
  const tankArc = buildArc(pct, tankColor(pct));
  const tankLine1 = pad(`E ${tankArc} F`, tankW);
  const tankLine2 = pad(`${formatNum(total)} / ${shortNum(maxTokens)}`, tankW);
  const tankLine3 = pad(`${(pct * 100).toFixed(1)}%`, tankW);

  // --- MPT GAUGE ---
  const mptW = 32;
  const mptMax = 5000;
  const mptFrac = Math.min(1, avg / mptMax);
  const mptArc = buildArc(mptFrac, mptColor(avg));
  const mptLine1 = pad(`5k ${mptArc} 500`, mptW);
  const mptLine2 = pad(`avg ${formatNum(avg)} tok/prompt`, mptW);
  const mptLine3 = pad(mptLabel(avg), mptW);

  const tankTitle = ' CONTEXT TANK ';
  const mptTitle = ' EFFICIENCY (MPT) ';

  const tankBorder = '═'.repeat(Math.max(0, Math.floor((tankW - tankTitle.length) / 2)));
  const mptBorder = '═'.repeat(Math.max(0, Math.floor((mptW - mptTitle.length) / 2)));

  const lines = [
    '',
    `     ╔${tankBorder}${tankTitle}${tankBorder}╗    ╔${mptBorder}${mptTitle}${mptBorder}╗`,
    `     ║  ${tankLine1}  ║    ║  ${mptLine1}  ║`,
    `     ║  ${tankLine2}  ║    ║  ${mptLine2}  ║`,
    `     ║  ${tankLine3}  ║    ║  ${mptLine3}  ║`,
    `     ╚${'═'.repeat(tankW + 2)}╝    ╚${'═'.repeat(mptW + 2)}╝`,
  ];

  console.log(lines.join('\n'));

  // --- METRICS STRIP ---
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

  // --- PROMPT LOG ---
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
      const pre = entry.estimated ? chalk.dim('~') : '';
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

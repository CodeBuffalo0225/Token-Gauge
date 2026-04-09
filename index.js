#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';
import { loadSession, resetSession, setMaxTokens } from './tracker.js';
import { renderDashboard } from './gauge.js';
import { runLive } from './modes/live.js';
import { runManual } from './modes/manual.js';
import { runEstimate } from './modes/estimate.js';

const DEFAULT_MAX_TOKENS = 200_000;

function parseArgs(argv) {
  const args = {
    mode: null,
    prompt: null,
    maxTokens: DEFAULT_MAX_TOKENS,
    reset: false,
    status: false,
    watch: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode' && argv[i + 1]) {
      args.mode = argv[++i];
    } else if (arg === '--prompt' && argv[i + 1]) {
      args.prompt = argv[++i];
    } else if ((arg === '--max-tokens' || arg === '--context') && argv[i + 1]) {
      args.maxTokens = parseInt(argv[++i], 10);
    } else if (arg === '--reset') {
      args.reset = true;
    } else if (arg === '--status') {
      args.status = true;
    } else if (arg === '--watch') {
      args.watch = true;
    }
  }

  return args;
}

function clearScreen() {
  process.stdout.write('\x1Bc');
}

async function promptContextWindow() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log(chalk.bold('Context window size:'));
  console.log(`  ${chalk.green('200,000')} — claude-sonnet / opus (default)`);
  console.log(`  ${chalk.blue('128,000')} — claude-haiku`);
  console.log(`  ${chalk.yellow(' 32,000')} — legacy / custom`);
  console.log('');

  return new Promise((resolve) => {
    rl.question('Enter context window size (default 200000): ', (answer) => {
      rl.close();
      const trimmed = answer.trim().replace(/,/g, '');
      if (!trimmed) return resolve(DEFAULT_MAX_TOKENS);
      const val = parseInt(trimmed, 10);
      if (isNaN(val) || val <= 0) return resolve(DEFAULT_MAX_TOKENS);
      resolve(val);
    });
  });
}

async function showModePicker() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log(chalk.bold('Token Gauge v2 — Pick your tracking mode'));
  console.log('─'.repeat(42));
  console.log(`  ${chalk.green('1)')} Live API    — Route prompts through Claude API (requires API key)`);
  console.log(`  ${chalk.blue('2)')} Manual      — Paste token counts from console.anthropic.com/usage`);
  console.log(`  ${chalk.cyan('3)')} Estimate    — Estimate usage from message text (no key needed)`);
  console.log(`  ${chalk.yellow('4)')} Status      — Show current dashboard only`);
  console.log('');

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      const choice = answer.trim();
      if (choice === '1') resolve('live');
      else if (choice === '2') resolve('manual');
      else if (choice === '3') resolve('estimate');
      else if (choice === '4') resolve('status');
      else {
        console.log(chalk.red('Invalid choice.'));
        process.exit(1);
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  let session = loadSession();

  if (args.reset) {
    session = resetSession();
    console.log(chalk.green('Session reset.'));
    renderDashboard(session, args.maxTokens);
    return;
  }

  // Resolve maxTokens: CLI flag > saved session value > interactive prompt
  const cliMaxProvided = process.argv.some(a => a === '--max-tokens' || a === '--context');
  let maxTokens;

  if (cliMaxProvided) {
    maxTokens = args.maxTokens;
    setMaxTokens(session, maxTokens);
  } else if (session.maxTokens) {
    maxTokens = session.maxTokens;
  } else if (args.status || args.watch) {
    maxTokens = DEFAULT_MAX_TOKENS;
  } else {
    maxTokens = await promptContextWindow();
    setMaxTokens(session, maxTokens);
  }

  args.maxTokens = maxTokens;

  if (args.status) {
    renderDashboard(session, maxTokens);
    return;
  }

  if (args.watch) {
    clearScreen();
    renderDashboard(session, maxTokens);
    setInterval(() => {
      session = loadSession();
      clearScreen();
      renderDashboard(session, maxTokens);
    }, 2000);
    return;
  }

  let mode = args.mode;
  if (!mode) {
    mode = await showModePicker();
  }

  if (mode === 'status') {
    renderDashboard(session, maxTokens);
    return;
  }

  if (mode === 'live') {
    await runLive(args);
  } else if (mode === 'manual') {
    await runManual(args);
  } else if (mode === 'estimate') {
    await runEstimate(args);
  } else {
    console.error(chalk.red(`Unknown mode: ${mode}`));
    console.error('Valid modes: live, manual, estimate');
    process.exit(1);
  }
}

main();

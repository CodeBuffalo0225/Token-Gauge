import readline from 'readline';
import chalk from 'chalk';
import { loadSession, recordPrompt } from '../tracker.js';
import { renderDashboard } from '../gauge.js';

function clearScreen() {
  process.stdout.write('\x1Bc');
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runManual(args) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let session = loadSession();

  const loop = async () => {
    clearScreen();
    console.log(chalk.bold('Token Gauge — Manual Entry Mode'));
    console.log('─'.repeat(36));
    console.log('Paste your token counts from console.anthropic.com/usage\n');

    const inputStr = await ask(rl, 'Input tokens used:  ');
    const inputTokens = parseInt(inputStr.replace(/,/g, ''), 10);
    if (isNaN(inputTokens) || inputTokens < 0) {
      console.log(chalk.red('Invalid number. Try again.'));
      return loop();
    }

    const outputStr = await ask(rl, 'Output tokens used: ');
    const outputTokens = parseInt(outputStr.replace(/,/g, ''), 10);
    if (isNaN(outputTokens) || outputTokens < 0) {
      console.log(chalk.red('Invalid number. Try again.'));
      return loop();
    }

    const label = await ask(rl, 'Label (optional):   ');

    session = recordPrompt(session, inputTokens, outputTokens, 'manual', {
      label: label.trim() || undefined,
    });

    const total = inputTokens + outputTokens;
    console.log(chalk.green(`\n✓ Logged ${total.toLocaleString('en-US')} tokens. Rendering dashboard...\n`));

    await new Promise((r) => setTimeout(r, 800));
    clearScreen();
    renderDashboard(session, args.maxTokens);

    const again = await ask(rl, 'Log another entry? (y/n): ');
    if (again.trim().toLowerCase() === 'y') {
      return loop();
    }

    rl.close();
    console.log('Goodbye!');
  };

  await loop();
}

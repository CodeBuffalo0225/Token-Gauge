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

const OUTPUT_SIZES = {
  '1': { label: 'Short', tokens: 200 },
  '2': { label: 'Medium', tokens: 800 },
  '3': { label: 'Long', tokens: 2000 },
};

export async function runEstimate(args) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let session = loadSession();

  const loop = async () => {
    clearScreen();
    console.log(chalk.bold('Token Gauge — Estimate Mode'));
    console.log('─'.repeat(32));
    console.log('Estimate your claude.ai session token usage\n');

    console.log('Your message (paste it, then press Enter):');
    const messageText = await ask(rl, '> ');

    console.log('\nApprox. Claude response length:');
    console.log('  1) Short   (~200 tokens)');
    console.log('  2) Medium  (~800 tokens)');
    console.log('  3) Long    (~2,000 tokens)');
    console.log('  4) Custom');
    const sizeChoice = await ask(rl, '> ');

    let outputTokens;
    if (sizeChoice.trim() === '4') {
      const custom = await ask(rl, 'Custom output tokens: ');
      outputTokens = parseInt(custom.replace(/,/g, ''), 10);
      if (isNaN(outputTokens) || outputTokens < 0) {
        console.log(chalk.red('Invalid number.'));
        return loop();
      }
    } else {
      const size = OUTPUT_SIZES[sizeChoice.trim()];
      if (!size) {
        console.log(chalk.red('Invalid choice. Try again.'));
        return loop();
      }
      outputTokens = size.tokens;
    }

    const turnStr = await ask(rl, '\nConversation turn # (how many messages so far): ');
    const priorTurns = Math.max(0, parseInt(turnStr, 10) - 1) || 0;

    // Estimation: ~4 chars per token for English + prior turn overhead
    const messageTokens = Math.ceil(messageText.length / 4);
    const priorOverhead = priorTurns * 600;
    const inputTokens = messageTokens + priorOverhead;

    const total = inputTokens + outputTokens;

    console.log('');
    console.log(chalk.cyan(`Estimated input tokens:   ~${inputTokens.toLocaleString('en-US')}`));
    console.log(chalk.cyan(`Estimated output tokens:  ~${outputTokens.toLocaleString('en-US')}`));
    console.log(chalk.cyan(`Estimated total:          ~${total.toLocaleString('en-US')}`));
    console.log('');

    const confirm = await ask(rl, 'Log this estimate? (y/n): ');
    if (confirm.trim().toLowerCase() !== 'y') {
      console.log('Discarded.');
      const again = await ask(rl, 'Try another estimate? (y/n): ');
      if (again.trim().toLowerCase() === 'y') return loop();
      rl.close();
      return;
    }

    session = recordPrompt(session, inputTokens, outputTokens, 'estimate');

    console.log(chalk.green(`\n✓ Logged. Rendering dashboard...\n`));
    await new Promise((r) => setTimeout(r, 800));
    clearScreen();
    renderDashboard(session, args.maxTokens);

    const again = await ask(rl, 'Log another estimate? (y/n): ');
    if (again.trim().toLowerCase() === 'y') {
      return loop();
    }

    rl.close();
    console.log('Goodbye!');
  };

  await loop();
}

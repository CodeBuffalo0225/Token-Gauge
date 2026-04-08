#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import readline from 'readline';
import { loadSession, resetSession, recordPrompt } from './tracker.js';
import { renderDashboard } from './gauge.js';

const DEFAULT_MAX_TOKENS = 200_000;
const MODEL = 'claude-sonnet-4-20250514';

function parseArgs(argv) {
  const args = {
    prompt: null,
    maxTokens: DEFAULT_MAX_TOKENS,
    reset: false,
    status: false,
    watch: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prompt' && argv[i + 1]) {
      args.prompt = argv[++i];
    } else if (arg === '--max-tokens' && argv[i + 1]) {
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

async function sendPrompt(client, prompt) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function clearScreen() {
  process.stdout.write('\x1Bc');
}

async function interactiveMode(client, session, maxTokens) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question('\n🔵 Enter prompt (or "quit" to exit): ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
        rl.close();
        console.log('Goodbye!');
        process.exit(0);
      }

      try {
        const result = await sendPrompt(client, trimmed);
        session = recordPrompt(session, result.inputTokens, result.outputTokens);

        clearScreen();
        renderDashboard(session, maxTokens);
        console.log('─'.repeat(60));
        console.log(result.text);
      } catch (err) {
        console.error('API Error:', err.message);
      }

      askQuestion();
    });
  };

  // Show current status first
  clearScreen();
  renderDashboard(session, maxTokens);
  askQuestion();
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.reset) {
    const session = resetSession();
    console.log('Session reset.');
    renderDashboard(session, args.maxTokens);
    return;
  }

  let session = loadSession();

  if (args.status) {
    renderDashboard(session, args.maxTokens);
    return;
  }

  if (args.watch) {
    clearScreen();
    renderDashboard(session, args.maxTokens);
    setInterval(() => {
      session = loadSession();
      clearScreen();
      renderDashboard(session, args.maxTokens);
    }, 2000);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
    console.error('Set it with: export ANTHROPIC_API_KEY=your_key_here');
    process.exit(1);
  }

  const client = new Anthropic();

  if (args.prompt) {
    // One-shot mode
    try {
      const result = await sendPrompt(client, args.prompt);
      session = recordPrompt(session, result.inputTokens, result.outputTokens);

      clearScreen();
      renderDashboard(session, args.maxTokens);
      console.log('─'.repeat(60));
      console.log(result.text);
    } catch (err) {
      console.error('API Error:', err.message);
      process.exit(1);
    }
  } else {
    // Interactive mode
    await interactiveMode(client, session, args.maxTokens);
  }
}

main();

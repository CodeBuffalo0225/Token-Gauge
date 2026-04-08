import Anthropic from '@anthropic-ai/sdk';
import readline from 'readline';
import { loadSession, recordPrompt } from '../tracker.js';
import { renderDashboard } from '../gauge.js';

const MODEL = 'claude-sonnet-4-20250514';

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

export async function runLive(args) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required for live mode.');
    console.error('Set it with: export ANTHROPIC_API_KEY=your_key_here');
    process.exit(1);
  }

  const client = new Anthropic();
  let session = loadSession();

  if (args.prompt) {
    try {
      const result = await sendPrompt(client, args.prompt);
      session = recordPrompt(session, result.inputTokens, result.outputTokens, 'live');

      clearScreen();
      renderDashboard(session, args.maxTokens);
      console.log('─'.repeat(60));
      console.log(result.text);
    } catch (err) {
      console.error('API Error:', err.message);
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  clearScreen();
  renderDashboard(session, args.maxTokens);

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
        session = recordPrompt(session, result.inputTokens, result.outputTokens, 'live');

        clearScreen();
        renderDashboard(session, args.maxTokens);
        console.log('─'.repeat(60));
        console.log(result.text);
      } catch (err) {
        console.error('API Error:', err.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

# Token Gauge

The Fuel Gauge of AI — this measures Your Token Usage.

Universal token usage tracker for Claude. Gas gauge for your context window.

## Three Modes

| Mode | Command | Requires |
|------|---------|----------|
| Live API | `--mode live` | ANTHROPIC_API_KEY |
| Manual entry | `--mode manual` | Nothing |
| Estimate | `--mode estimate` | Nothing |

## Install

```bash
npm install
node index.js
```

## Usage

```bash
node index.js                              # Mode picker menu
node index.js --mode live --prompt "..."   # One-shot API call
node index.js --mode manual                # Paste token counts
node index.js --mode estimate              # Estimate from message text
node index.js --status                     # Show dashboard
node index.js --reset                      # Clear session
node index.js --watch                      # Auto-refresh every 2s
```

Built by [@CodeBuffalo0225](https://github.com/CodeBuffalo0225)

# Token Gauge — Lovable Build Prompt

Paste everything below into Lovable.

---

## Build: Token Gauge Web Dashboard

Build a single-page React + Tailwind web app called **Token Gauge** — a polished visual dashboard that shows a user's Claude / Anthropic token consumption in real time. It's a "fuel gauge for AI."

The user is a heavy Claude Code + Claude Cowork user who wants to track three things at a glance:

1. **Context Tank** — how full is the live context window of the current session (0–200k tokens)
2. **Efficiency (MPT)** — average tokens per prompt in the current session (500–15k scale)
3. **Weekly Tank** — how much of the weekly billable-token budget is used (0–5M default, configurable)

---

## Design system

Dark-first aesthetic, clean and data-forward. Think Linear / Vercel / modern SaaS dashboards.

**Colors (CSS vars):**
- `--bg: #0B0D12` (page background)
- `--surface: #11141B` (card background)
- `--border: #1F242E`
- `--text: #E5E7EB`
- `--text-dim: #9AA3B2`
- `--green: #1D9E75` (healthy)
- `--yellow: #BA7517` (warning)
- `--red: #E24B4A` (critical)
- `--blue: #378ADD` (efficient / info)

**Typography:** Inter or similar. Numbers should use `font-variant-numeric: tabular-nums`.

**Layout:** Responsive grid. Desktop: 2-column gauge row on top (Context + MPT), Weekly gauge below spanning full width. Metrics strip below that. Prompt log table at the bottom. Mobile: single column, stacked.

---

## Three gauges — exact specs

Each gauge is a **180° semicircle** rendered as SVG. The arc goes from 180° (left, "E") to 0° (right, "F"). A needle (filled circle ●) points to the current value. The arc *behind* the needle is filled with a color; the arc *ahead* is dim gray.

### Gauge 1 — Context Tank (top-left card)
- **Range:** 0 to `maxTokens` (default 200,000)
- **Fill direction:** Left-to-right. Empty tank = needle at E (left), full tank = needle at F (right).
- **Color logic** (based on `remainingPct = 1 - usedPct`):
  - `remainingPct > 0.5` → green
  - `remainingPct > 0.25` → yellow
  - else → red
- **Center readouts:**
  - Big number: `{used.toLocaleString()} / {maxShort}` (e.g. "43,556 / 200k")
  - Smaller: `{pct.toFixed(1)}%`
- **Card title:** "CONTEXT TANK"
- **Labels under arc:** "E" (left), "F" (right)

### Gauge 2 — Efficiency / MPT (top-right card)
- **Range:** 500 to 15,000 avg tokens-per-prompt
- **Inverted:** HIGH MPT = needle on LEFT (heavy), LOW MPT = needle on RIGHT (efficient)
- **Color logic** (based on avg):
  - `avg <= 3000` → blue ("EFFICIENT")
  - `avg <= 8000` → yellow ("MODERATE")
  - else → red ("HEAVY")
- **Center readouts:**
  - Big number: `avg {avg.toLocaleString()} tok/prompt`
  - Smaller: efficiency label (EFFICIENT / MODERATE / HEAVY)
- **Card title:** "EFFICIENCY (MPT)"
- **Labels under arc:** "15k" (left), "500" (right)

### Gauge 3 — Weekly Tank (full-width card below)
- **Range:** 0 to `weeklyBudget` (default 5,000,000)
- **Fill direction:** Left-to-right, same color logic as Context Tank
- **Center readouts:**
  - Big number: `{usedShort} / {budgetShort}` (e.g. "1.1M / 5.0M")
  - Smaller: `{pct.toFixed(1)}% used this week`
  - Caption: `week of {weekStartDate}`
- **Card title:** "WEEKLY TANK"
- Show a reset countdown badge in the corner: "Resets Mon 4:00 PM EDT"

**`shortNum(n)` formatter:** `>= 1M → "X.XM"`, `>= 1k → "Xk"`, else raw.

---

## Metrics strip (row of 4 stat cards below gauges)

1. **Tokens Used** — big number, caption "of {maxShort} ctx"
2. **Tank Level** — `{pct}%`, caption: "Plenty left" / "Good shape" / "Getting low" / "Running out"
3. **Tokens/Prompt** — avg, caption "avg per msg"
4. **Prompts Left** — floor((max - used) / avg), caption "est. at avg"

Use the same color accents as the gauges.

---

## Prompt log table (bottom)

Last 10 entries from `promptLog`. Columns:

| # | ↑ Input | ↓ Output | Total | Running | Source | Time |
|---|---|---|---|---|---|---|

- Source is a small colored chip: `claude-code` (blue), `cowork` (purple), `manual` (gray), `estimate` (gray dashed).
- Time shows relative ("2m ago") with tooltip of full timestamp.

---

## Data model

The app reads a single JSON object shaped like this:

```json
{
  "totalInputTokens": 437720800,
  "totalOutputTokens": 188645,
  "promptCount": 5525,
  "currentSessionId": "a505e2c0",
  "currentSessionInput": 350000,
  "currentSessionOutput": 4200,
  "currentSessionPrompts": 12,
  "currentContextSize": 43556,
  "currentSessionStartedAt": "2026-04-13T23:45:00Z",
  "currentSessionLastSeen": "2026-04-14T00:10:00Z",
  "weekStart": "2026-04-13T20:00:00Z",
  "weeklyUsedInput": 1075000,
  "weeklyUsedOutput": 5432,
  "maxTokens": 200000,
  "promptLog": [
    {
      "index": 5525,
      "inputTokens": 43556,
      "outputTokens": 92,
      "total": 43648,
      "cumulative": 438204613,
      "mode": "autotrack",
      "source": "claude-code",
      "sessionId": "a505e2c0",
      "model": "claude-opus-4-6",
      "timestamp": "2026-04-14T00:10:00Z"
    }
  ]
}
```

**Key derived values:**
- Context tank uses `currentContextSize` (NOT cumulative — it's the live window fill from the last turn's input total).
- MPT = `(currentSessionInput + currentSessionOutput) / currentSessionPrompts`
- Weekly total = `weeklyUsedInput + weeklyUsedOutput`
- `weeklyBudget` comes from a separate config: default 5,000,000.

---

## Data ingestion — three modes

Top-right of the header: a mode toggle (segmented control).

### Mode 1: **Upload** (default)
- File input accepting `.json`
- Drag-and-drop zone
- On upload, validate shape and render

### Mode 2: **Paste**
- A collapsible textarea
- "Load" button parses the JSON
- Show a validation error inline if malformed

### Mode 3: **Demo**
- Pre-populate with a realistic mock (see above) so the dashboard has life even before the user loads their data
- Include a "View demo data" link to see what's loaded

Below the toggle: a small label showing the data source + timestamp of last load. If data is loaded, add a "Refresh" button (re-runs last load).

---

## Config panel (collapsible, right side)

A small settings cog opens a drawer with:
- **Context window max** — number input (default 200,000)
- **Weekly budget** — number input (default 5,000,000)
- **Weekly reset day** — dropdown (Sun-Sat, default Mon)
- **Weekly reset hour (UTC)** — number 0-23 (default 20 for 4pm EDT)

Settings persist to `localStorage`. Update gauges live.

---

## Additional requirements

- **Empty state:** If no data loaded, show a friendly hero explaining what Token Gauge is + a "Try demo" button.
- **Lifetime footer strip:** small dim-text line showing `Lifetime: 438,204,613 tokens across 5,525 prompts • current session: a505e2c0`
- **Accessibility:** all gauges need `aria-label` and `role="meter"`. Sliders (config drawer) need labels.
- **No external data fetching** — keep it fully client-side. Users bring their own `session.json`.
- **Small delight:** when a gauge needle moves to a new value, animate the transition (~400ms ease-out).

---

## Tech stack

- **React 18** + **TypeScript**
- **Tailwind CSS** for styling (use the color vars above)
- **SVG for gauges** — no chart library needed, hand-roll the arc/needle math
- **Vite**
- Single page, no routing
- State via `useState` / `localStorage`; no Redux, no Zustand unless trivial

---

## Acceptance criteria

1. Opening the app in demo mode shows three populated gauges with the values from the sample JSON above.
2. Uploading a real `session.json` re-renders all gauges, metrics, and prompt log within 300ms.
3. Weekly tank color goes green → yellow → red as usage climbs toward budget.
4. MPT gauge correctly inverts (high values pull needle left).
5. Context tank shows the **live window** (from `currentContextSize`), not cumulative input.
6. Config drawer changes (e.g. bumping weekly budget from 5M to 15M) re-render the weekly gauge immediately.
7. Works on mobile (single-column stack, gauges still readable at 320px wide).

Ship it.

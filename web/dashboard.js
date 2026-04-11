// ── Token Gauge Web Dashboard ─────────────────────────────
// All 5 fixes from the upgrade applied:
//   1. Color logic tied to remainingPct
//   2. Division-by-zero + input clamping guards + warning badge
//   3. Accessibility labels on sliders
//   4. Test Extremes validation button
//   5. MPT gauge scale 15,000 with recalibrated color thresholds

// ── State ────────────────────────────────────────────────
let sMax = 200000;
let sUsed = 0;
let sMpt = 1000;

// ── DOM refs ─────────────────────────────────────────────
const sMaxEl = document.getElementById('s-max');
const sUsedEl = document.getElementById('s-used');
const sMptEl = document.getElementById('s-mpt');
const sMaxValEl = document.getElementById('s-max-val');
const sUsedValEl = document.getElementById('s-used-val');
const sMptValEl = document.getElementById('s-mpt-val');

const tankFillEl = document.getElementById('tank-fill');
const tankNeedleEl = document.getElementById('tank-needle');
const tankUsedEl = document.getElementById('tank-used');
const tankMaxEl = document.getElementById('tank-max');
const tankPctEl = document.getElementById('tank-pct');
const tankBadgeEl = document.getElementById('tank-badge');

const effFillEl = document.getElementById('eff-fill');
const effNeedleEl = document.getElementById('eff-needle');
const effMptEl = document.getElementById('eff-mpt');
const effBadgeEl = document.getElementById('eff-badge');

const mUsedEl = document.getElementById('m-used');
const mUsedSubEl = document.getElementById('m-used-sub');
const mPctEl = document.getElementById('m-pct');
const mLevelEl = document.getElementById('m-level');
const mMptEl = document.getElementById('m-mpt');
const mLeftEl = document.getElementById('m-left');

const logBodyEl = document.getElementById('log-body');
const warningEl = document.getElementById('input-warning');

// Arc geometry: semicircle from angle 180° (left) to 0° (right)
// SVG arc path length ≈ π × r = π × 80 ≈ 251.3
const ARC_LEN = 251.3;
const ARC_CX = 100;
const ARC_CY = 110;
const ARC_R = 80;

// ── Color helpers ────────────────────────────────────────

// Fix 1: Tank color derived from REMAINING percentage (not used)
function getColor(remainingPct) {
  if (remainingPct > 0.5) return '#1D9E75';   // green = plenty left
  if (remainingPct > 0.25) return '#BA7517';  // yellow = getting low
  return '#E24B4A';                            // red = nearly empty
}

// Fix 5: MPT color thresholds at 3k / 8k / 15k scale
function getEffColor(mpt) {
  if (mpt <= 3000) return '#378ADD';           // blue = efficient
  if (mpt <= 8000) return '#BA7517';           // yellow = moderate
  return '#E24B4A';                            // red = heavy
}

// Fix 5: MPT fraction calculated against 15k max
function getEffPct(mpt) {
  const max = 15000;
  return Math.min(1, Math.max(0, mpt / max));
}

function getTankLevelLabel(remainingPct) {
  if (remainingPct > 0.75) return 'Plenty left';
  if (remainingPct > 0.5) return 'Good shape';
  if (remainingPct > 0.25) return 'Getting low';
  return 'Running out';
}

function formatNum(n) {
  return Math.round(n).toLocaleString('en-US');
}

function shortNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

// Convert fraction (0–1) to needle endpoint on the semicircle
// fraction 0 = left (180°), fraction 1 = right (0°)
function needleEndpoint(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const angle = Math.PI * (1 - clamped); // 180° → 0°
  const x = ARC_CX + ARC_R * Math.cos(angle);
  const y = ARC_CY - ARC_R * Math.sin(angle);
  return { x, y };
}

// ── Main update ──────────────────────────────────────────
function update() {
  // Fix 2: Guards — division-by-zero + input clamping
  if (!sMax || sMax <= 0) sMax = 1;
  if (sUsed < 0) sUsed = 0;

  const rawUsed = parseInt(sUsedEl.value, 10);
  const clamped = rawUsed > sMax;
  sUsed = Math.min(sUsed, sMax);

  // Warning badge
  if (clamped) {
    warningEl.textContent = '⚠️ Used tokens exceed max — clamped.';
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }

  // ── TANK GAUGE ────────────────────────────────────
  const usedPct = sUsed / sMax;
  const remainingPct = 1 - usedPct;
  const tankColor = getColor(remainingPct);

  // Fill: from E (left) up to the needle position.
  // Needle position on arc = remainingPct (0 = at E, 1 = at F).
  // Stroke-dasharray fills from the start of the path.
  const fillLen = remainingPct * ARC_LEN;
  tankFillEl.setAttribute('stroke-dasharray', `${fillLen} ${ARC_LEN}`);
  tankFillEl.setAttribute('stroke', tankColor);

  // Needle
  const tankEnd = needleEndpoint(remainingPct);
  tankNeedleEl.setAttribute('x2', tankEnd.x);
  tankNeedleEl.setAttribute('y2', tankEnd.y);

  // Readouts
  tankUsedEl.textContent = formatNum(sUsed);
  tankMaxEl.textContent = shortNum(sMax);
  tankPctEl.textContent = (usedPct * 100).toFixed(1) + '%';
  tankBadgeEl.textContent = getTankLevelLabel(remainingPct);
  tankBadgeEl.style.background = tankColor;

  // ── EFFICIENCY (MPT) GAUGE ────────────────────────
  const effFrac = getEffPct(sMpt);
  const effColor = getEffColor(sMpt);

  // Inverted: efficient (low MPT) = needle on RIGHT (500 side)
  // Heavy (high MPT) = needle on LEFT (15k side)
  // Fraction for needle position: 1 - effFrac (so low MPT = 1 = right)
  const effNeedleFrac = 1 - effFrac;
  const effEnd = needleEndpoint(effNeedleFrac);
  effNeedleEl.setAttribute('x2', effEnd.x);
  effNeedleEl.setAttribute('y2', effEnd.y);

  // Fill from right (500) side toward the needle as MPT grows (heavier)
  // Actually: fill represents the "efficient range" from needle rightward
  const effFillLen = effNeedleFrac * ARC_LEN;
  effFillEl.setAttribute('stroke-dasharray', `${effFillLen} ${ARC_LEN}`);
  effFillEl.setAttribute('stroke', effColor);

  effMptEl.textContent = formatNum(sMpt);

  // Fix 5: Efficiency badge thresholds match 3k / 8k / 15k
  if (sMpt <= 3000) {
    effBadgeEl.textContent = 'Efficient';
    effBadgeEl.style.background = '#378ADD';
  } else if (sMpt <= 8000) {
    effBadgeEl.textContent = 'Moderate';
    effBadgeEl.style.background = '#BA7517';
  } else {
    effBadgeEl.textContent = 'Heavy use';
    effBadgeEl.style.background = '#E24B4A';
  }

  // ── METRICS STRIP ─────────────────────────────────
  mUsedEl.textContent = formatNum(sUsed);
  mUsedSubEl.textContent = `of ${shortNum(sMax)} ctx`;
  mPctEl.textContent = (usedPct * 100).toFixed(1) + '%';
  mLevelEl.textContent = getTankLevelLabel(remainingPct);
  mMptEl.textContent = formatNum(sMpt);

  const remaining = sMax - sUsed;
  const promptsLeft = sMpt > 0 ? Math.floor(remaining / sMpt) : 0;
  mLeftEl.textContent = formatNum(promptsLeft);

  // ── SLIDER VALUE LABELS ───────────────────────────
  sMaxValEl.textContent = formatNum(sMax);
  sUsedValEl.textContent = formatNum(sUsed);
  sMptValEl.textContent = formatNum(sMpt);

  // Keep s-used slider max in sync with s-max
  sUsedEl.max = sMax;
}

// ── Event listeners ──────────────────────────────────────
sMaxEl.addEventListener('input', (e) => {
  sMax = parseInt(e.target.value, 10);
  update();
});

sUsedEl.addEventListener('input', (e) => {
  sUsed = parseInt(e.target.value, 10);
  update();
});

sMptEl.addEventListener('input', (e) => {
  sMpt = parseInt(e.target.value, 10);
  update();
});

// Fix 4: Test Extremes button — cycles through 0, 25, 50, 75, 100% used
document.getElementById('test-extremes').addEventListener('click', () => {
  const steps = [0, sMax * 0.25, sMax * 0.5, sMax * 0.75, sMax];
  let i = 0;
  const interval = setInterval(() => {
    sUsedEl.value = steps[i];
    sUsed = steps[i];
    update();
    i++;
    if (i >= steps.length) clearInterval(interval);
  }, 600);
});

// Initial render
update();

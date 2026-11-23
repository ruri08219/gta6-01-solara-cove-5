// SOLARA COVE — audio.js
// One job: every sound in the game, synthesized with WebAudio — no audio
// files, no network requests. Gunshots, explosions, the police siren loop,
// engine hum, cash pickup, UI clicks, and the WASTED / BUSTED sting.
// This module never edits police.js / jobs.js / combat.js: it watches
// their public state through the frame updater and reacts to changes
// (wanted level, tracer fire, health drops, cash gains, car explosions).

import { Solara, clamp } from './config.js';
import { keys, wasPressed } from './input.js';
import { cars } from './vehicles.js';

const A = Solara.audio;
A.muted = A.muted ?? false;
A.ctx = null;
A.master = null;
A.siren = null;
A.engine = null;

let lastWanted = 0;
let lastHealth = 100;
let lastCash = Solara.cash;
let lastDown = null;
let lastTracer = 0;
let engineOn = false;
const explodedSeen = new Set();

/** Create (or resume) the shared AudioContext. Must be called from a user gesture path. */
export function ensureAudio() {
  if (!A.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    A.ctx = new Ctx();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.9;
    A.master.connect(A.ctx.destination);
  }
  if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  return A.ctx;
}

// First gesture anywhere unlocks audio (browsers require it).
['pointerdown', 'keydown'].forEach((ev) => {
  window.addEventListener(ev, () => ensureAudio(), { once: false, passive: true });
});

/** Short UI click blip. Called by crew / radio / save on their key actions. */
export function click() {
  const ctx = ensureAudio();
  if (!ctx || A.muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, t);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  o.connect(g);
  g.connect(A.master);
  o.start(t);
  o.stop(t + 0.08);
}
A.click = click;

/** Generic one-shot synth blip used by the SFX below. */
function blip(type, freq0, freq1, dur, vol) {
  const ctx = ensureAudio();
  if (!ctx || A.muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq0, t);
  if (freq1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(A.master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Filtered noise burst (shot crack / explosion body). */
function noiseBurst(dur, vol, filterFreq) {
  const ctx = ensureAudio();
  if (!ctx || A.muted) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(A.master);
  src.start(t);
}

function playShot() {
  noiseBurst(0.09, 0.35, 3200);
  blip('square', 220, 70, 0.08, 0.12);
}

function playExplosion() {
  noiseBurst(0.9, 0.6, 500);
  blip('sine', 120, 30, 0.8, 0.5);
}

function playHurt() {
  blip('sawtooth', 160, 90, 0.18, 0.2);
}

function playCash() {
  const ctx = ensureAudio();
  if (!ctx || A.muted) return;
  const t = ctx.currentTime;
  [880, 1318].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t0 = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    o.connect(g);
    g.connect(A.master);
    o.start(t0);
    o.stop(t0 + 0.25);
  });
}

function playDownSting() {
  blip('sawtooth', 220, 55, 1.1, 0.25);
  blip('sine', 110, 40, 1.2, 0.3);
}

/** Two-tone police siren loop while wanted > 0. */
function startSiren() {
  const ctx = ensureAudio();
  if (!ctx || A.siren) return;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 750;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 0.55; // slow wail: ~0.9 s per tone
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(o.frequency);
  const g = ctx.createGain();
  g.gain.value = A.muted ? 0 : 0.05;
  o.connect(g);
  g.connect(A.master);
  o.start();
  lfo.start();
  A.siren = { osc: o, lfo, gain: g };
}

function stopSiren() {
  if (!A.siren) return;
  try {
    A.siren.osc.stop();
    A.siren.lfo.stop();
  } catch (_) { /* already stopped */ }
  A.siren = null;
}

/** Engine hum: sawtooth whose pitch follows the driven car's speed. */
function updateEngine(dt) {
  const p = Solara.player;
  const want = !!(p && p.inCar && !p.inCar.exploded && Solara.phase === 'PLAY');
  if (want && !engineOn) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(f);
    f.connect(g);
    g.connect(A.master);
    o.start();
    A.engine = { osc: o, gain: g };
    engineOn = true;
  }
  if (!want && engineOn) {
    try { A.engine.osc.stop(); } catch (_) { /* already stopped */ }
    A.engine = null;
    engineOn = false;
  }
  if (engineOn && A.engine) {
    const speed = Math.abs(p.inCar.speed || 0);
    A.engine.osc.frequency.setTargetAtTime(55 + speed * 4.5, A.ctx.currentTime, 0.08);
    A.engine.gain.gain.setTargetAtTime(A.muted ? 0 : 0.045 + Math.min(0.03, speed * 0.001), A.ctx.currentTime, 0.1);
  }
}

function updateAudio(dt, t) {
  // M toggles mute.
  if (wasPressed('KeyM')) {
    A.muted = !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.9;
    if (A.siren) A.siren.gain.gain.value = A.muted ? 0 : 0.05;
  }
  if (Solara.phase !== 'PLAY') {
    if (A.siren) stopSiren();
    updateEngine(dt);
    return;
  }
  if (!A.ctx) return; // no gesture yet: stay silent, never throw

  // Siren follows the wanted level.
  const wanted = Solara.police.wanted || 0;
  if (wanted > 0 && lastWanted === 0) startSiren();
  if (wanted === 0 && lastWanted > 0) stopSiren();
  lastWanted = wanted;

  // Gunfire: combat sets _tracerT = 0.07 on every shot (player or enemy).
  const tracerT = Solara.combat._tracerT || 0;
  if (tracerT > 0 && lastTracer <= 0) playShot();
  lastTracer = tracerT;

  // Player hurt: health dropped since last frame.
  const health = Solara.combat.health ?? 100;
  if (health < lastHealth) playHurt();
  lastHealth = health;

  // Cash gained: job payout or pickup.
  if (Solara.cash > lastCash) playCash();
  lastCash = Solara.cash;

  // WASTED / BUSTED sting.
  const down = Solara.combat.down;
  if (down && down !== lastDown) playDownSting();
  lastDown = down;

  // Car explosions: a car newly flagged exploded.
  for (const car of cars) {
    if (car.exploded && !explodedSeen.has(car)) {
      explodedSeen.add(car);
      playExplosion();
    }
  }
  updateEngine(dt);
}

Solara.updaters.push(updateAudio);

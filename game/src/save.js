// SOLARA COVE — save.js
// One job: the save system. LocalStorage key 'solara-cove-save'. F saves
// the run (cash, respect, rank, jobs done + active job + stage, player
// position, in-game clock). When a save exists, a "Continue" button is
// added to the start screen dynamically (this file never edits index.html).
// Loading restores the public Solara state; the story jobs module picks the
// saved job back up from Solara.jobs.active / stageIndex on its next frame
// (its 3D stage marker is only placed when a stage starts, so a loaded
// save shows the objective text but the marker reappears on the next stage).

import { Solara } from './config.js';
import { wasPressed } from './input.js';

const SAVE_KEY = 'solara-cove-save';

const S = Solara.save;
S.slot = S.slot ?? null;

/** Read the save from localStorage (null when there is none / it is corrupt). */
export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || typeof data.cash !== 'number') return null;
    return data;
  } catch (_) {
    return null;
  }
}

/** Write the current run to localStorage. Returns the saved object. */
export function writeSave() {
  const p = Solara.player;
  const data = {
    version: 'solara-cove-1',
    savedAt: Date.now(),
    cash: Solara.cash,
    respect: Solara.respect,
    rank: Solara.rank,
    jobsDone: Solara.jobs.done,
    jobStatuses: Solara.jobs.list.map((j) => ({ id: j.id, status: j.status })),
    activeJob: Solara.jobs.active,
    stageIndex: Solara.jobs.stageIndex ?? 0,
    player: p ? { x: p.x, z: p.z, heading: p.heading } : null,
    clock: Solara.clock,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (_) {
    return null; // storage full / blocked: fail silently, never crash the game
  }
  S.slot = data;
  return data;
}

/** Apply a save object to the live game state. Returns true on success. */
export function applySave(data) {
  if (!data) return false;
  const p = Solara.player;
  Solara.cash = data.cash ?? Solara.cash;
  Solara.respect = data.respect ?? Solara.respect;
  Solara.rank = data.rank ?? Solara.rank;
  Solara.clock = data.clock ?? Solara.clock;
  Solara.jobs.done = data.jobsDone ?? Solara.jobs.done;
  if (Array.isArray(data.jobStatuses)) {
    for (const saved of data.jobStatuses) {
      const entry = Solara.jobs.list.find((j) => j.id === saved.id);
      if (entry) entry.status = saved.status;
    }
  }
  Solara.jobs.active = data.activeJob ?? null;
  Solara.jobs.stageIndex = data.stageIndex ?? 0;
  Solara.jobs.dialogue = {
    speaker: 'Delgado',
    text: 'Back already? Good — the Cove kept your seat warm. Pick up where you left off.',
  };
  Solara.jobs.objective = '';
  if (p && data.player) {
    if (p.inCar) p.inCar = null;
    p.x = data.player.x ?? p.x;
    p.z = data.player.z ?? p.z;
    p.heading = data.player.heading ?? 0;
    p.y = 0;
    p.vy = 0;
    p.speed = 0;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
  return true;
}

S.save = writeSave;
S.load = applySave;
S.hasSave = () => readSave() !== null;

// --- start-screen wiring (DOM only, index.html untouched) ---------------------
function addContinueButton() {
  const save = readSave();
  if (!save) return;
  const startScreen = document.getElementById('start-screen');
  const startButton = document.getElementById('start-button');
  if (!startScreen || !startButton || document.getElementById('continue-button')) return;
  const btn = document.createElement('button');
  btn.id = 'continue-button';
  btn.type = 'button';
  btn.textContent = 'CONTINUE';
  btn.style.cssText = 'margin-top:14px;background:#2fa8a0;box-shadow:0 4px 0 #1d6b66;';
  btn.addEventListener('click', () => {
    if (applySave(readSave())) Solara.startGame();
  });
  startButton.insertAdjacentElement('afterend', btn);
  const note = document.createElement('div');
  note.id = 'continue-note';
  note.style.cssText = 'margin-top:10px;font-size:13px;color:#ffe9c4;';
  const when = new Date(save.savedAt);
  note.textContent = `Saved run: $${save.cash} · ${save.rank} · ${save.jobsDone}/8 jobs · ${when.toLocaleString()}`;
  btn.insertAdjacentElement('afterend', note);

  // Document the extra keys on the start screen controls (no index.html edit).
  const controls = startScreen.querySelector('.controls');
  if (controls) {
    const extra = document.createElement('div');
    extra.textContent = 'F save game · M mute · R change radio · 1 / 2 / 3 crew abilities';
    controls.appendChild(extra);
  }
}

function updateSave(dt, t) {
  // F saves the run (edge-triggered). NOTE: combat.js also fires a shot on
  // F — the save still lands; see the part-3 report for the key conflict.
  if (wasPressed('KeyF') && (Solara.phase === 'PLAY' || Solara.phase === 'PAUSED')) {
    if (writeSave()) Solara.audio.click?.();
  }
}

addContinueButton();
Solara.updaters.push(updateSave);

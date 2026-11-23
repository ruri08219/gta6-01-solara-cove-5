// SOLARA COVE — hud.js
// One job: the dense HUD. Every element is created dynamically by JS
// (index.html is never edited). Top-left mission panel, top-right Solara
// PD dispatch + wanted stars + cash/respect/rank, bottom-centre dialogue,
// bottom-left weapons + health + car condition, bottom-right speed +
// district + clock + radio + the minimap slot (minimap.js fills it), left
// crew panel, centre crosshair on foot. Text refreshes ~10x/second;
// speed and the minimap repaint every frame. The WASTED / BUSTED overlay
// lives in combat.js at z-index 60 — the HUD sits at z-index 5 and never
// covers it.

import { Solara, clamp } from './config.js';
import { findMarkerPos } from './minimap.js';

const H = Solara.hud;
H.dirty = true;

// In-game clock: no other module advances Solara.clock, so the HUD derives
// it here — 1 game-hour per real minute, starting at 12:30 — and writes it
// back so the save system can store it.
const CLOCK_START = 12.5;
const CLOCK_RATE = 1 / 60; // game-hours per real second

const WEAPONS = [
  { id: 'fists', name: 'Fists', key: '—' },
  { id: 'pistol', name: 'Pistol', key: 'F / Click' },
];

let root = null;
let missionTitle, missionStage, missionObjective, missionDistance, missionPrompt;
let starsEl, cashEl, respectEl, rankEl, dispatchEl;
let dialogueBox, dialogueSpeaker, dialogueText, promptLine;
let weaponSlotsEl, healthFill, healthText, carBox, carFill, carText, carBurning;
let crewListEl;
let speedEl, districtEl, clockEl, radioStationEl, radioSongEl, tickerTextEl;
let crosshairEl;

function el(tag, id, css) {
  const n = document.createElement(tag);
  if (id) n.id = id;
  n.style.cssText = css;
  return n;
}

const PANEL = 'background:rgba(8,14,20,0.72);border:1px solid rgba(255,214,110,0.35);border-radius:8px;color:#f2ede4;font-family:Arial,sans-serif;padding:10px 12px;pointer-events:none;';
const LABEL = 'font-size:10px;letter-spacing:2px;color:#ffd76e;text-transform:uppercase;opacity:0.9;';

function buildHud() {
  root = el('div', 'hud', 'position:fixed;inset:0;z-index:5;pointer-events:none;font-family:Arial,sans-serif;display:none;');
  document.body.appendChild(root);

  // --- top-left: mission panel ---------------------------------------------
  const mission = el('div', 'mission-panel', `position:absolute;top:12px;left:12px;min-width:280px;max-width:340px;${PANEL}`);
  mission.appendChild(el('div', null, LABEL)).textContent = 'Current Job';
  missionTitle = el('div', null, 'font-size:16px;font-weight:bold;margin-top:4px;');
  mission.appendChild(missionTitle);
  missionStage = el('div', null, 'font-size:12px;color:#9fd8c8;margin-top:2px;');
  mission.appendChild(missionStage);
  missionObjective = el('div', null, 'font-size:13px;margin-top:6px;line-height:1.4;');
  mission.appendChild(missionObjective);
  missionDistance = el('div', null, 'font-size:12px;color:#ffd76e;margin-top:6px;');
  mission.appendChild(missionDistance);
  root.appendChild(mission);

  // --- top-right: dispatch + stars + cash ----------------------------------
  const dispatch = el('div', 'dispatch-panel', `position:absolute;top:12px;right:12px;width:300px;${PANEL}`);
  const statusRow = el('div', null, 'display:flex;justify-content:space-between;align-items:baseline;');
  starsEl = el('span', null, 'font-size:20px;letter-spacing:2px;color:#ff3b30;');
  statusRow.appendChild(starsEl);
  cashEl = el('span', null, 'font-size:16px;font-weight:bold;color:#7dff8a;');
  statusRow.appendChild(cashEl);
  dispatch.appendChild(statusRow);
  const respectRow = el('div', null, 'display:flex;justify-content:space-between;font-size:12px;margin-top:4px;color:#c8d8e2;');
  respectEl = el('span', null, '');
  rankEl = el('span', null, 'font-weight:bold;color:#ffd76e;');
  respectRow.appendChild(respectEl);
  respectRow.appendChild(rankEl);
  dispatch.appendChild(respectRow);
  dispatch.appendChild(el('div', null, `${LABEL}margin-top:8px;`)).textContent = 'Solara PD — Dispatch';
  dispatchEl = el('div', null, 'font-size:12px;line-height:1.7;margin-top:2px;');
  dispatch.appendChild(dispatchEl);
  root.appendChild(dispatch);

  // --- left: crew panel ------------------------------------------------------
  const crew = el('div', 'crew-panel', `position:absolute;left:12px;top:210px;width:230px;${PANEL}`);
  crew.appendChild(el('div', null, LABEL)).textContent = 'Crew';
  crewListEl = el('div', null, 'font-size:12px;line-height:1.6;margin-top:4px;');
  crew.appendChild(crewListEl);
  root.appendChild(crew);

  // --- bottom-centre: prompt + dialogue --------------------------------------
  const bottomCentre = el('div', null, 'position:absolute;left:50%;bottom:96px;transform:translateX(-50%);width:520px;max-width:72vw;text-align:center;');
  promptLine = el('div', 'prompt-line', 'font-size:14px;font-weight:bold;color:#ffd76e;text-shadow:0 1px 3px rgba(0,0,0,0.8);margin-bottom:6px;');
  bottomCentre.appendChild(promptLine);
  dialogueBox = el('div', 'dialogue-box', `${PANEL}text-align:left;display:none;`);
  dialogueSpeaker = el('div', null, 'font-size:12px;font-weight:bold;color:#ffd76e;letter-spacing:1px;');
  dialogueBox.appendChild(dialogueSpeaker);
  dialogueText = el('div', null, 'font-size:14px;line-height:1.45;margin-top:3px;');
  dialogueBox.appendChild(dialogueText);
  bottomCentre.appendChild(dialogueBox);
  root.appendChild(bottomCentre);

  // --- bottom-left: weapons + health + car -----------------------------------
  const bl = el('div', 'weapons-panel', `position:absolute;left:12px;bottom:12px;width:250px;${PANEL}`);
  bl.appendChild(el('div', null, LABEL)).textContent = 'Weapons';
  weaponSlotsEl = el('div', null, 'display:flex;gap:6px;margin-top:6px;');
  bl.appendChild(weaponSlotsEl);
  const hpRow = el('div', null, 'display:flex;align-items:center;gap:8px;margin-top:10px;');
  hpRow.appendChild(el('span', null, 'font-size:11px;color:#c8d8e2;')).textContent = 'HP';
  const hpBar = el('div', null, 'flex:1;height:12px;background:rgba(255,255,255,0.15);border-radius:6px;overflow:hidden;');
  healthFill = el('div', null, 'height:100%;width:100%;background:#4dd06a;border-radius:6px;');
  hpBar.appendChild(healthFill);
  hpRow.appendChild(hpBar);
  healthText = el('span', null, 'font-size:12px;width:34px;text-align:right;');
  hpRow.appendChild(healthText);
  bl.appendChild(hpRow);
  carBox = el('div', null, 'margin-top:10px;display:none;');
  carBox.appendChild(el('span', null, 'font-size:11px;color:#c8d8e2;')).textContent = 'CAR';
  const carBar = el('div', null, 'height:12px;background:rgba(255,255,255,0.15);border-radius:6px;overflow:hidden;margin-top:4px;');
  carFill = el('div', null, 'height:100%;width:100%;background:#4da3ff;border-radius:6px;');
  carBar.appendChild(carFill);
  carBox.appendChild(carBar);
  carText = el('div', null, 'font-size:12px;margin-top:3px;');
  carBox.appendChild(carText);
  carBurning = el('div', null, 'font-size:13px;font-weight:bold;color:#ff7a1a;margin-top:3px;display:none;');
  carBurning.textContent = '🔥 BURNING! Get out or it blows!';
  carBox.appendChild(carBurning);
  bl.appendChild(carBox);
  root.appendChild(bl);

  // --- bottom-right: speed + district + clock + radio + minimap ---------------
  const br = el('div', 'hud-br', 'position:absolute;right:12px;bottom:12px;display:flex;align-items:flex-end;gap:12px;');
  const info = el('div', null, `${PANEL}text-align:right;min-width:210px;`);
  speedEl = el('div', null, 'font-size:40px;font-weight:900;line-height:1;color:#ffffff;');
  info.appendChild(speedEl);
  districtEl = el('div', null, 'font-size:13px;color:#ffd76e;margin-top:2px;');
  info.appendChild(districtEl);
  clockEl = el('div', null, 'font-size:12px;color:#c8d8e2;margin-top:2px;');
  info.appendChild(clockEl);
  radioStationEl = el('div', null, 'font-size:12px;font-weight:bold;color:#9fd8c8;margin-top:6px;');
  info.appendChild(radioStationEl);
  radioSongEl = el('div', null, 'font-size:12px;color:#e8f2f8;');
  info.appendChild(radioSongEl);
  const ticker = el('div', null, 'margin-top:6px;height:15px;overflow:hidden;white-space:nowrap;max-width:220px;margin-left:auto;');
  tickerTextEl = el('span', null, 'display:inline-block;font-size:11px;color:#ffb62e;animation:ticker-scroll 22s linear infinite;');
  ticker.appendChild(tickerTextEl);
  info.appendChild(ticker);
  br.appendChild(info);
  const minimapSlot = el('div', 'minimap-slot', '');
  br.appendChild(minimapSlot);
  root.appendChild(br);

  // Ticker keyframes (injected once).
  const style = document.createElement('style');
  style.textContent = '@keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }';
  document.head.appendChild(style);

  // --- centre crosshair (on foot only) ---------------------------------------
  crosshairEl = el('div', 'crosshair', 'position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);display:none;');
  crosshairEl.innerHTML = '<div style="position:absolute;left:8px;top:0;width:2px;height:18px;background:rgba(255,255,255,0.85);"></div><div style="position:absolute;top:8px;left:0;width:18px;height:2px;background:rgba(255,255,255,0.85);"></div>';
  root.appendChild(crosshairEl);

  buildWeaponSlots();
}

function buildWeaponSlots() {
  weaponSlotsEl.innerHTML = '';
  for (const w of WEAPONS) {
    const slot = document.createElement('div');
    const active = w.id === 'pistol';
    slot.style.cssText = `flex:1;text-align:center;padding:6px 2px;border-radius:6px;font-size:12px;font-weight:bold;border:1px solid ${active ? '#ffd76e' : 'rgba(255,255,255,0.25)'};background:${active ? 'rgba(255,214,110,0.25)' : 'rgba(255,255,255,0.06)'};color:${active ? '#ffd76e' : '#c8d8e2'};`;
    slot.textContent = `${w.name}`;
    const key = document.createElement('div');
    key.style.cssText = 'font-size:10px;font-weight:normal;opacity:0.8;margin-top:2px;';
    key.textContent = w.key;
    slot.appendChild(key);
    weaponSlotsEl.appendChild(slot);
  }
}

function formatClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const period = h < 12 ? 'AM' : 'PM';
  return `${hh}:${mm} ${period}`;
}

function statusColor(status) {
  if (status === 'pursuing') return '#ff6a5e';
  if (status === 'responding') return '#ffd76e';
  if (status === 'searching') return '#ff9d4d';
  return '#9fd8c8'; // patrol
}

let textTimer = 0;

function updateHudText() {
  const p = Solara.player;
  const J = Solara.jobs;

  // Mission panel.
  if (J.active) {
    const entry = J.list.find((j) => j.id === J.active);
    missionTitle.textContent = entry ? `${entry.name}` : J.active;
    missionStage.textContent = `Stage ${(J.stageIndex ?? 0) + 1}/4 · ${J.done}/8 jobs done`;
    missionObjective.textContent = J.objective || '—';
    const marker = findMarkerPos();
    if (marker && p) {
      const d = Math.round(Math.hypot(p.x - marker.x, p.z - marker.z));
      missionDistance.textContent = `▸ Marker: ${d} m`;
    } else {
      missionDistance.textContent = '▸ No marker — follow the objective';
    }
  } else {
    missionTitle.textContent = 'Free Roam';
    missionStage.textContent = `${J.done}/8 jobs done`;
    missionObjective.textContent = 'No active job — steal a car, explore the Cove, or wait for Delgado’s next call.';
    missionDistance.textContent = '';
  }
  promptLine.textContent = J.prompt || '';

  // Dispatch + economy.
  const wanted = Solara.police.wanted || 0;
  starsEl.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
  starsEl.style.color = wanted > 0 ? '#ff3b30' : 'rgba(255,255,255,0.35)';
  cashEl.textContent = `$${Solara.cash}`;
  respectEl.textContent = `Respect ${Solara.respect}`;
  rankEl.textContent = Solara.rank;
  const dispatch = Solara.police.dispatch || [];
  if (dispatch.length === 0) {
    dispatchEl.textContent = wanted > 0 ? 'Units en route…' : 'Streets quiet — no units on you.';
  } else {
    dispatchEl.innerHTML = '';
    for (const u of dispatch.slice(0, 6)) {
      const row = document.createElement('div');
      row.innerHTML = `<span style="color:${statusColor(u.status)}">●</span> ${u.name} — ${u.distance} m · ${u.status}`;
      dispatchEl.appendChild(row);
    }
  }

  // Dialogue.
  if (J.dialogue) {
    dialogueBox.style.display = 'block';
    dialogueSpeaker.textContent = J.dialogue.speaker || '';
    dialogueText.textContent = J.dialogue.text || '';
  } else {
    dialogueBox.style.display = 'none';
  }

  // Health.
  const health = clamp(Solara.combat.health ?? 100, 0, 100);
  healthFill.style.width = `${health}%`;
  healthFill.style.background = health > 50 ? '#4dd06a' : health > 25 ? '#ffb62e' : '#ff3b30';
  healthText.textContent = `${Math.ceil(health)}`;

  // Car condition (only while driving).
  if (p && p.inCar && !p.inCar.exploded) {
    const hp = clamp(p.inCar.hp ?? 100, 0, 100);
    carBox.style.display = 'block';
    carFill.style.width = `${hp}%`;
    carFill.style.background = hp > 50 ? '#4da3ff' : hp > 25 ? '#ffb62e' : '#ff3b30';
    carText.textContent = `Condition ${Math.ceil(hp)}% · ${p.inCar.kind || 'sedan'}`;
    carBurning.style.display = hp < 35 ? 'block' : 'none';
  } else {
    carBox.style.display = 'none';
  }

  // Crew panel.
  crewListEl.innerHTML = '';
  for (const m of Solara.crew.members || []) {
    const cd = Math.max(0, Math.ceil((m.readyAt || 0) - Solara.time));
    const row = document.createElement('div');
    row.innerHTML = `<b>[${m.keyLabel}] ${m.name}</b> <span style="color:#9fd8c8">${m.role}</span><br>` +
      `<span style="color:#c8d8e2">${m.ability} — ${cd > 0 ? `ready in ${cd}s` : '<b style="color:#7dff8a">READY</b>'}</span>`;
    crewListEl.appendChild(row);
  }

  // District + clock + radio (text part).
  districtEl.textContent = `📍 ${Solara.district || 'Downtown'}`;
  clockEl.textContent = formatClock(Solara.clock ?? CLOCK_START);
  const st = Solara.radio;
  radioStationEl.textContent = `♪ ${st.station !== undefined ? ['Cove FM 98.2', 'Harbor Beats 104.7', 'Old Town Talk 91.5'][st.station] || '' : ''}`;
  radioSongEl.textContent = st.song ? `“${st.song}”` : '';
  const ticker = st.ticker || '';
  tickerTextEl.textContent = ticker ? `${ticker}   •   ${ticker}   •   ` : '';
}

function updateHud(dt, t) {
  if (!root) buildHud();
  root.style.display = Solara.phase === 'START' ? 'none' : 'block';

  // Clock advances with play time (written back for the save system).
  if (Solara.phase === 'PLAY') {
    Solara.clock = (CLOCK_START + Solara.time * CLOCK_RATE) % 24;
  }

  // Speed every frame (big readout, bottom-right).
  const p = Solara.player;
  if (p) {
    const speed = p.inCar ? Math.abs(p.inCar.speed || 0) : (p.speed || 0);
    speedEl.textContent = `${Math.round(speed * 3.6)}`;
    const unit = document.createElement('span');
    unit.style.cssText = 'font-size:14px;font-weight:normal;color:#c8d8e2;';
    unit.textContent = ' km/h';
    speedEl.appendChild(unit);
    crosshairEl.style.display = (!p.inCar && Solara.phase === 'PLAY') ? 'block' : 'none';
  }

  // Text ~10x/second.
  textTimer += dt;
  if (textTimer >= 0.1) {
    textTimer = 0;
    updateHudText();
  }
}

Solara.updaters.push(updateHud);

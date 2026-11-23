// SOLARA COVE — crew.js
// One job: Mara's crew. Three original members, each with one active
// ability on keys 1 / 2 / 3 and a cooldown. The HUD panel (hud.js) reads
// Solara.crew to render names, abilities and cooldowns; this module owns
// the state and the effects. All three are consistent with the story in
// jobs.js: Ilya the smuggler-mechanic (job 6), Rook, Delgado's driver,
// and Pip, the lookout who watches the PD.

import { Solara } from './config.js';
import { wasPressed } from './input.js';
import { addHeat } from './police.js';

const C = Solara.crew;
C.members = C.members ?? [];
C.revealUntil = C.revealUntil ?? 0;

const MEMBERS = [
  {
    id: 'ilya',
    name: 'Ilya',
    role: 'Mechanic',
    ability: 'Full Repair',
    desc: 'Restores your car to full condition',
    key: 'Digit1',
    keyLabel: '1',
    cooldown: 45,
    readyAt: 0,
  },
  {
    id: 'rook',
    name: 'Rook',
    role: 'Driver',
    ability: 'Clean Getaway',
    desc: 'Delgado’s driver tips off a dispatcher — lose one wanted star',
    key: 'Digit2',
    keyLabel: '2',
    cooldown: 60,
    readyAt: 0,
  },
  {
    id: 'pip',
    name: 'Pip',
    role: 'Lookout',
    ability: 'Eyes on the PD',
    desc: 'Marks every police unit on the minimap for 10 seconds',
    key: 'Digit3',
    keyLabel: '3',
    cooldown: 30,
    readyAt: 0,
  },
];

if (C.members.length === 0) {
  for (const m of MEMBERS) C.members.push({ ...m });
}

function useAbility(member) {
  const p = Solara.player;
  if (!p) return false;
  if (member.id === 'ilya') {
    if (!p.inCar) return false; // needs a car to repair
    if (p.inCar.exploded) return false;
    p.inCar.hp = 100;
    return true;
  }
  if (member.id === 'rook') {
    if ((Solara.police.wanted || 0) <= 0) return false; // nothing to lose
    addHeat(-30); // drops roughly one wanted star (heat gaps are 8–25)
    return true;
  }
  if (member.id === 'pip') {
    C.revealUntil = Solara.time + 10;
    return true;
  }
  return false;
}

function updateCrew(dt, t) {
  if (Solara.phase !== 'PLAY') return;
  for (const member of C.members) {
    if (!wasPressed(member.key)) continue;
    if (t < member.readyAt) continue; // still cooling down
    if (useAbility(member)) {
      member.readyAt = t + member.cooldown;
      Solara.audio.click?.();
    }
  }
}

Solara.updaters.push(updateCrew);

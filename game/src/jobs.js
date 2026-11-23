// SOLARA COVE — jobs.js
// One job: the story. Eight original story jobs for Mara Voss, a courier
// turned runner for fixer Delgado, caught between the Cove Kings gang and
// Solara PD. Every job has 4 stages; completing a job pays cash and
// respect and raises Mara's rank from Nobody to Cove Legend. This module
// only owns job DATA + STATE + the 3D stage marker — Part 3 renders the
// dialogue / objective / progress on the HUD.
// Stage types: goto | talk | pickup | deliver | chase | escape | shootout.
//   goto/deliver/talk: reach the marker. pickup: reach + press E.
//   chase: stay within 9 m of the fleeing car for 1.5 s (or wreck it).
//   escape: bring the wanted level back to 0. shootout: defeat all spawns.

import { Solara, clamp } from './config.js';
import { scene } from './render.js';
import { wasPressed } from './input.js';
import { spawnCar, updateCar } from './vehicles.js';
import { addHeat } from './police.js';
import { spawnEnemy } from './combat.js';

const RANKS = [
  { min: 0, name: 'Nobody' },
  { min: 25, name: 'Runner' },
  { min: 60, name: 'Hustler' },
  { min: 120, name: 'Street Boss' },
  { min: 200, name: 'Cove Kingpin' },
  { min: 300, name: 'Cove Legend' },
];

function rankFor(respect) {
  let r = RANKS[0].name;
  for (const entry of RANKS) if (respect >= entry.min) r = entry.name;
  return r;
}

// --- the eight jobs ---------------------------------------------------------------
// Coordinates sit on the street grid (blocks of 42 + 14 streets, span ~252).
const JOBS = [
  {
    id: 'job1', name: 'First Light on the Cove', giver: 'Delgado', reward: 150, respect: 25,
    stages: [
      { type: 'talk', x: 150, z: -150, radius: 6, title: 'Meet Delgado at the Marina pier',
        intro: { speaker: 'Delgado', text: 'Mara Voss. The Cove eats newcomers — unless they run for me. First job is simple: a package, a drop, no questions.' },
        outro: { speaker: 'Mara', text: 'No questions. Just the package.' } },
      { type: 'pickup', x: -160, z: 160, radius: 6, title: 'Pick up the package at the Harbor warehouse (E)',
        intro: { speaker: 'Delgado', text: 'Warehouse 4, Harbor side. Grab it and walk out like you own the place.' },
        outro: { speaker: 'Mara', text: 'Got it. Light as a promise.' } },
      { type: 'deliver', x: -150, z: -150, radius: 6, title: 'Deliver the package to the Old Town drop',
        intro: { speaker: 'Delgado', text: 'Old Town, blue door. And Mara — the PD patrols that street tonight. Keep moving.' },
        outro: { speaker: 'Mara', text: 'Delivered. They never even saw me.' } },
      { type: 'escape', x: 0, z: 0, radius: 0, title: 'Lose the heat — get the wanted level back to zero',
        intro: { speaker: 'Delgado', text: 'A patrol clocked you. Break line of sight and let the heat die down.' },
        outro: { speaker: 'Delgado', text: 'Clean. You run like you were born here, Mara.' } },
    ],
  },
  {
    id: 'job2', name: 'The Harbor Ledger', giver: 'Delgado', reward: 300, respect: 30,
    stages: [
      { type: 'pickup', x: -170, z: 120, radius: 6, title: 'Steal the ledger from the Harbor office (E)',
        intro: { speaker: 'Delgado', text: 'The Cove Kings keep a ledger of every bribe in this city. It is sitting in their Harbor office. Take it.' },
        outro: { speaker: 'Mara', text: 'Ledger secured. Names, dates, all of it.' } },
      { type: 'chase', x: -120, z: 60, radius: 9, title: 'Catch the Kings courier fleeing in his car',
        intro: { speaker: 'Delgado', text: 'Their courier saw you — he is running. Catch that car before he reaches the Hillside.' },
        outro: { speaker: 'Mara', text: 'Courier stopped. He will not be delivering anything.' } },
      { type: 'deliver', x: 20, z: 20, radius: 6, title: 'Bring the ledger to Delgado in Downtown',
        intro: { speaker: 'Delgado', text: 'Downtown, my usual corner. Bring it here and the Kings lose their leverage.' },
        outro: { speaker: 'Delgado', text: 'Beautiful. The Kings just lost their memory.' } },
      { type: 'shootout', x: 40, z: 0, radius: 14, title: 'Kings ambush in Downtown — fight them off',
        intro: { speaker: 'Mara', text: 'Ambush! The Kings sent a crew to take the ledger back.' },
        outro: { speaker: 'Delgado', text: 'You handled them. The Cove is starting to notice you, Mara.' } },
    ],
  },
  {
    id: 'job3', name: 'Kings of the Cove', giver: 'Delgado', reward: 450, respect: 35,
    stages: [
      { type: 'talk', x: 150, z: 150, radius: 6, title: 'Confront the Kings lookout on the Hillside',
        intro: { speaker: 'Mara', text: 'Hillside belongs to the Kings? Then tell them Mara Voss is here to collect.' },
        outro: { speaker: 'Kings Lookout', text: 'You picked the wrong hill, courier.' } },
      { type: 'shootout', x: 150, z: 150, radius: 16, title: 'Clear the Kings crew on the Hillside',
        intro: { speaker: 'Mara', text: 'They came down the hill swinging. Fine — I swing back.' },
        outro: { speaker: 'Mara', text: 'Hill is quiet now.' } },
      { type: 'chase', x: 120, z: 120, radius: 9, title: 'Run down the Kings lieutenant fleeing the hill',
        intro: { speaker: 'Delgado', text: 'Their lieutenant is bolting in a sports car. He knows where their stash is — catch him.' },
        outro: { speaker: 'Mara', text: 'Lieutenant caught. He talks fast when he is scared.' } },
      { type: 'deliver', x: 20, z: 20, radius: 6, title: 'Deliver the lieutenant’s phone to Delgado',
        intro: { speaker: 'Delgado', text: 'His phone has the stash addresses. Bring it to me, Downtown.' },
        outro: { speaker: 'Delgado', text: 'Three stashes. The Kings are bleeding, and you did it.' } },
    ],
  },
  {
    id: 'job4', name: 'Air One', giver: 'Delgado', reward: 600, respect: 40,
    stages: [
      { type: 'pickup', x: 150, z: -150, radius: 6, title: 'Pick up the tracker from Delgado at the Marina (E)',
        intro: { speaker: 'Delgado', text: 'Solara PD impounded one of my cars. I need a tracker on it before they crack it open. Take this.' },
        outro: { speaker: 'Mara', text: 'Tracker in hand.' } },
      { type: 'pickup', x: -140, z: 180, radius: 6, title: 'Plant the tracker on the impounded car at the Harbor (E)',
        intro: { speaker: 'Delgado', text: 'Impound lot, Harbor. The car is the blue sedan. Plant it and walk away clean.' },
        outro: { speaker: 'Mara', text: 'Tracker planted. They will never look under the bumper.' } },
      { type: 'escape', x: 0, z: 0, radius: 0, title: 'The PD is on you — lose the heat',
        intro: { speaker: 'Delgado', text: 'A patrol spotted you at the lot. Three stars at least — vanish, Mara.' },
        outro: { speaker: 'Delgado', text: 'You ghosted a full patrol. Impressive.' } },
      { type: 'deliver', x: 20, z: 20, radius: 6, title: 'Deliver the tracker signal log to Delgado',
        intro: { speaker: 'Delgado', text: 'The signal is live. Bring me the log and I will know every move the PD makes.' },
        outro: { speaker: 'Delgado', text: 'Now I see them coming before they do. You are worth every dollar.' } },
    ],
  },
  {
    id: 'job5', name: 'The Vane Job', giver: 'Vane Kessler', reward: 750, respect: 45,
    stages: [
      { type: 'talk', x: -150, z: -150, radius: 6, title: 'Meet rival fixer Vane Kessler in Old Town',
        intro: { speaker: 'Vane Kessler', text: 'Delgado is small time, Mara. I pay double for the same run — if you are not afraid of the Kings.' },
        outro: { speaker: 'Mara', text: 'Double pay buys double risk. I am listening.' } },
      { type: 'pickup', x: -170, z: 150, radius: 6, title: 'Pick up Vane’s crates at the Harbor pier (E)',
        intro: { speaker: 'Vane Kessler', text: 'Crates at the pier. Heavy, quiet, mine. Do not open them.' },
        outro: { speaker: 'Mara', text: 'Crates loaded. Heavy is right.' } },
      { type: 'deliver', x: 170, z: 170, radius: 6, title: 'Deliver the crates to the Hillside mansion',
        intro: { speaker: 'Vane Kessler', text: 'Hillside mansion, top of the slope. The PD watches that road — stay sharp.' },
        outro: { speaker: 'Mara', text: 'Delivered. The mansion has a lot of locks for a summer house.' } },
      { type: 'shootout', x: 170, z: 170, radius: 16, title: 'Kings hit squad at the mansion — fight them off',
        intro: { speaker: 'Mara', text: 'The Kings followed the crates. Of course they did.' },
        outro: { speaker: 'Vane Kessler', text: 'You fight like you belong in this city, Mara. Delgado does not deserve you.' } },
    ],
  },
  {
    id: 'job6', name: 'Smuggler’s Tide', giver: 'Ilya', reward: 900, respect: 50,
    stages: [
      { type: 'talk', x: 190, z: -60, radius: 6, title: 'Meet smuggler Ilya at the Marina docks',
        intro: { speaker: 'Ilya', text: 'The tide brings cargo, the tide takes it away. Tonight it brings something the Kings want very badly.' },
        outro: { speaker: 'Mara', text: 'Tide and trouble. My two favourite things.' } },
      { type: 'pickup', x: 200, z: 60, radius: 6, title: 'Pick up the cargo on the east beach (E)',
        intro: { speaker: 'Ilya', text: 'East beach, past the palms. A crate washed up where no crate should be. Grab it before the Kings do.' },
        outro: { speaker: 'Mara', text: 'Cargo secured — and it is ticking. Kidding. Mostly.' } },
      { type: 'chase', x: 180, z: 0, radius: 9, title: 'A rival crew is stealing the cargo — run them down',
        intro: { speaker: 'Ilya', text: 'A rival crew grabbed a second crate and they are running up the beach road! Catch them!' },
        outro: { speaker: 'Mara', text: 'Crate recovered. The beach road is mine tonight.' } },
      { type: 'deliver', x: 20, z: 20, radius: 6, title: 'Deliver both crates to Delgado in Downtown',
        intro: { speaker: 'Delgado', text: 'Ilya’s cargo is worth more than my whole week. Bring it here, Mara.' },
        outro: { speaker: 'Delgado', text: 'This crate alone pays for your next month. You are no runner anymore — you are a name.' } },
    ],
  },
  {
    id: 'job7', name: 'Siege on Solara PD', giver: 'Delgado', reward: 1100, respect: 55,
    stages: [
      { type: 'talk', x: 20, z: 20, radius: 6, title: 'Delgado’s big plan in Downtown',
        intro: { speaker: 'Delgado', text: 'The PD seized my evidence locker — proof the Kings own half the force. We take it back tonight, in front of everyone.' },
        outro: { speaker: 'Mara', text: 'In front of everyone. You really know how to make an entrance.' } },
      { type: 'shootout', x: 0, z: -40, radius: 18, title: 'Fight through the PD cordon at the Downtown plaza',
        intro: { speaker: 'Mara', text: 'The whole precinct is here — and Air One is overhead. Hold the plaza!' },
        outro: { speaker: 'Mara', text: 'Plaza is ours. The evidence is in my hands.' } },
      { type: 'escape', x: 0, z: 0, radius: 0, title: 'Four stars and a helicopter — lose the heat',
        intro: { speaker: 'Delgado', text: 'Four stars, Mara! Air One is on you. Break away and let it die down — do not get caught now.' },
        outro: { speaker: 'Delgado', text: 'You outran a helicopter. The whole Cove will hear about this.' } },
      { type: 'deliver', x: 150, z: -150, radius: 6, title: 'Deliver the evidence to Delgado at the Marina',
        intro: { speaker: 'Delgado', text: 'Marina pier. That evidence ends the Kings’ hold on this city — bring it home.' },
        outro: { speaker: 'Delgado', text: 'It is done. The PD cannot protect the Kings anymore. One job left, Mara.' } },
    ],
  },
  {
    id: 'job8', name: 'Cove Legend', giver: 'Delgado', reward: 1500, respect: 60,
    stages: [
      { type: 'talk', x: -180, z: 200, radius: 6, title: 'Final meet at the Harbor lighthouse',
        intro: { speaker: 'Delgado', text: 'Vane Kessler is selling the whole Cove to the highest bidder tonight — at the lighthouse. End it, Mara. End all of it.' },
        outro: { speaker: 'Mara', text: 'Tonight the Cove picks a side. Mine.' } },
      { type: 'shootout', x: -180, z: 200, radius: 18, title: 'Kessler’s crew holds the lighthouse — take it',
        intro: { speaker: 'Mara', text: 'Kings and Kessler’s men, shoulder to shoulder. This is the whole war in one place.' },
        outro: { speaker: 'Mara', text: 'The lighthouse is mine. Kessler has nowhere left to hide.' } },
      { type: 'chase', x: -140, z: 140, radius: 9, title: 'Kessler is fleeing — run him down',
        intro: { speaker: 'Delgado', text: 'Kessler is bolting in his car! He has the buyer’s ledger — catch him before he leaves the Cove!' },
        outro: { speaker: 'Mara', text: 'Got you, Vane. The Cove is not for sale.' } },
      { type: 'deliver', x: 150, z: -150, radius: 6, title: 'Bring Kessler’s ledger to Delgado at the Marina',
        intro: { speaker: 'Delgado', text: 'Marina pier, one last time. Bring me that ledger and the Cove is ours.' },
        outro: { speaker: 'Delgado', text: 'Cove Legend, Mara Voss. The sun never sets on this city — and now it knows your name.' } },
    ],
  },
];

// --- state -------------------------------------------------------------------------
const J = Solara.jobs;
J.list = JOBS.map((j) => ({ id: j.id, name: j.name, giver: j.giver, status: 'locked', reward: j.reward }));
J.list[0].status = 'available';
J.active = null;
J.done = 0;
J.stageIndex = 0;
J.dialogue = null; // { speaker, text } — Part 3 renders this
J.objective = '';
J.prompt = ''; // e.g. 'Press E to pick up' — Part 3 renders this

let stageState = null; // per-stage runtime: { enemies, chaseCar, chaseT, heatSet }

// --- the 3D stage marker ------------------------------------------------------------
let marker = null;
function ensureMarker() {
  if (marker) return marker;
  const g = new THREE.Group();
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 17;
  g.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd94d }),
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = 8;
  arrow.name = 'arrow';
  g.add(arrow);
  g.visible = false;
  scene.add(g);
  marker = g;
  return g;
}

function placeMarker(x, z) {
  const m = ensureMarker();
  m.position.set(x, 0, z);
  m.visible = true;
}

function hideMarker() {
  if (marker) marker.visible = false;
}

// --- stage flow ----------------------------------------------------------------------
function currentJobDef() {
  if (!J.active) return null;
  return JOBS.find((j) => j.id === J.active) ?? null;
}

function currentStageDef() {
  const job = currentJobDef();
  if (!job) return null;
  return job.stages[J.stageIndex] ?? null;
}

function startStage() {
  const job = currentJobDef();
  const stage = currentStageDef();
  if (!job || !stage) return;
  stageState = { enemies: [], chaseCar: null, chaseT: 0, heatSet: false };
  J.dialogue = stage.intro;
  J.objective = stage.title;
  J.prompt = stage.type === 'pickup' ? 'Press E to pick up' : '';
  if (stage.type === 'escape') {
    hideMarker();
    // Guarantee there is heat to escape from.
    if (Solara.police.wanted === 0) {
      addHeat(job.id === 'job7' ? 62 : job.id === 'job4' ? 42 : 24);
      stageState.heatSet = true;
    }
  } else if (stage.type === 'chase') {
    hideMarker();
  } else {
    placeMarker(stage.x, stage.z);
  }
}

function startJob(jobDef) {
  const entry = J.list.find((l) => l.id === jobDef.id);
  if (entry) entry.status = 'active';
  J.active = jobDef.id;
  J.stageIndex = 0;
  startStage();
}

function completeStage() {
  const job = currentJobDef();
  const stage = currentStageDef();
  if (!job || !stage) return;
  if (stage.outro) J.dialogue = stage.outro;
  if (stageState?.chaseCar && !stageState.chaseCar.exploded) {
    stageState.chaseCar.driver = null;
    stageState.chaseCar.speed = 0;
  }
  stageState = null;
  J.stageIndex += 1;
  if (J.stageIndex >= job.stages.length) {
    completeJob(job);
  } else {
    startStage();
  }
}

function completeJob(job) {
  const entry = J.list.find((l) => l.id === job.id);
  if (entry) entry.status = 'done';
  J.done += 1;
  Solara.cash += job.reward;
  Solara.respect += job.respect;
  Solara.rank = rankFor(Solara.respect);
  J.active = null;
  J.objective = '';
  J.prompt = '';
  hideMarker();
  J.dialogue = { speaker: 'Delgado', text: `Job done — $${job.reward} and the Cove knows your name a little better. (${J.done}/8 jobs)` };
  const next = JOBS[JOBS.indexOf(job) + 1];
  if (next) {
    const nextEntry = J.list.find((l) => l.id === next.id);
    if (nextEntry) nextEntry.status = 'available';
    startJob(next);
  } else {
    J.dialogue = { speaker: 'Delgado', text: 'All eight jobs done. Cove Legend, Mara Voss — the sun never sets on this city, and now it knows your name.' };
  }
}

// --- stage mechanics -------------------------------------------------------------------
function distTo(x, z) {
  const p = Solara.player;
  return Math.hypot(p.x - x, p.z - z);
}

function updateGotoStage(stage, dt) {
  if (distTo(stage.x, stage.z) < stage.radius) completeStage();
}

function updatePickupStage(stage, dt) {
  if (distTo(stage.x, stage.z) < stage.radius) {
    J.prompt = 'Press E to pick up';
    if (wasPressed('KeyE')) {
      J.prompt = '';
      if (stage.type === 'pickup' && J.active === 'job1' && J.stageIndex === 2) addHeat(8);
      if (stage.type === 'pickup' && J.active === 'job5' && J.stageIndex === 2) addHeat(8);
      completeStage();
    }
  } else {
    J.prompt = '';
  }
}

function updateChaseStage(stage, dt) {
  if (!stageState.chaseCar) {
    const car = spawnCar(scene, stage.x, stage.z, Math.random() * Math.PI * 2, 'flee', 'sport');
    car.hp = 120;
    stageState.chaseCar = car;
  }
  const car = stageState.chaseCar;
  if (car.exploded) { completeStage(); return; }
  const p = Solara.player;
  // Flee: drive away from the player, down the streets.
  const desired = Math.atan2(car.x - p.x, car.z - p.z);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  updateCar(car, 1, clamp(diff * 2, -1, 1), dt);
  const d = Math.hypot(p.x - car.x, p.z - car.z);
  if (d < 9) {
    stageState.chaseT += dt;
    if (stageState.chaseT >= 1.5) completeStage();
  } else {
    stageState.chaseT = Math.max(0, stageState.chaseT - dt);
  }
}

function updateEscapeStage(stage, dt) {
  if (Solara.police.wanted === 0) completeStage();
}

function updateShootoutStage(stage, dt) {
  if (stageState.enemies.length === 0) {
    const count = J.active === 'job8' ? 6 : J.active === 'job7' ? 5 : J.active === 'job5' ? 4 : J.active === 'job3' ? 4 : 3;
    const kind = J.active === 'job7' ? 'cop' : 'gang';
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const e = spawnEnemy(stage.x + Math.cos(a) * 10, stage.z + Math.sin(a) * 10, kind);
      stageState.enemies.push(e);
    }
    if (J.active === 'job7') addHeat(20); // the plaza fight draws the whole precinct
  }
  if (stageState.enemies.every((e) => !e.alive)) completeStage();
}

// --- the updater -------------------------------------------------------------------------
function updateJobs(dt, t) {
  const p = Solara.player;
  if (!p) return;
  if (!J.active) {
    const next = J.list.find((l) => l.status === 'available');
    if (next) startJob(JOBS.find((j) => j.id === next.id));
    return;
  }
  const stage = currentStageDef();
  if (!stage) return;

  // Marker arrow bobs while a marker stage is active.
  if (marker?.visible) {
    const arrow = marker.getObjectByName('arrow');
    if (arrow) arrow.position.y = 8 + Math.sin(t * 3) * 0.8;
  }

  switch (stage.type) {
    case 'goto':
    case 'talk':
    case 'deliver':
      updateGotoStage(stage, dt);
      break;
    case 'pickup':
      updatePickupStage(stage, dt);
      break;
    case 'chase':
      updateChaseStage(stage, dt);
      break;
    case 'escape':
      updateEscapeStage(stage, dt);
      break;
    case 'shootout':
      updateShootoutStage(stage, dt);
      break;
    default:
      break;
  }
}

Solara.updaters.push(updateJobs);

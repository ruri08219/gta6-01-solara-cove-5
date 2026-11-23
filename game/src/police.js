// SOLARA COVE — police.js
// One job: the Solara PD wanted system. Wanted level 0-5 driven by a heat
// meter, named patrol units (cars + foot officers) with a live dispatch
// list, roadblocks at wanted >= 3, the "Air One" helicopter with a
// spotlight cone at wanted >= 4, and BUSTED arrests when an officer
// catches the player standing still. Part 3 renders the dispatch list;
// this module only owns the data + the 3D units + the state.
// WASTED/BUSTED respawn lives in combat.js; police asks for a bust by
// setting Solara.combat.requestBusted (no import cycle that way).

import { Solara, CITY, clamp } from './config.js';
import { scene } from './render.js';
import { createCarMesh, updateCar, cars } from './vehicles.js';
import { colliders } from './city.js';

// Heat needed to reach each wanted level (index = wanted level).
const HEAT_FOR_WANTED = [0, 8, 22, 40, 60, 85];
// How many units the city fields at each wanted level.
const UNITS_FOR_WANTED = [0, 2, 3, 4, 5, 6];
// How many patrol cars cruise while the player is clean.
const PATROL_CARS_CLEAN = 2;

const OFFICER_NAMES = [
  'Officer Reyes', 'Officer Brandt', 'Officer Okafor', 'Officer Lindqvist',
  'Sergeant Vega', 'Officer Tanaka', 'Officer Marsh', 'Officer Doyle',
  'Officer Fontaine', 'Officer Kaur', 'Officer Novak', 'Officer Hale',
];

// --- state (extends the stub declared in config.js) -----------------------
const P = Solara.police;
P.heat = P.heat ?? 0;
P.wanted = P.wanted ?? 0;
P.units = P.units ?? [];
P.dispatch = P.dispatch ?? [];
P.heli = null;
P.roadblock = null;
P.bustedTimer = 0;
P.lastSeenAt = -99;
P._spawnCd = 0;
P._dispatchCd = 0;
P._nameIdx = 0;

function nextName() {
  const n = OFFICER_NAMES[P._nameIdx % OFFICER_NAMES.length];
  P._nameIdx += 1;
  return n;
}

function wantedFromHeat(heat) {
  let w = 0;
  for (let i = 1; i < HEAT_FOR_WANTED.length; i++) {
    if (heat >= HEAT_FOR_WANTED[i]) w = i;
  }
  return w;
}

/** Raise the heat meter; wanted level follows. Called by combat/jobs. */
export function addHeat(amount) {
  P.heat = clamp(P.heat + amount, 0, 100);
  const w = wantedFromHeat(P.heat);
  if (w !== P.wanted) {
    P.wanted = w;
    Solara.stars = w;
  }
}

function hitsBuilding(x, z, r) {
  for (const b of colliders) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return false;
}

function distToPlayer(x, z) {
  const p = Solara.player;
  if (!p) return 9999;
  return Math.hypot(p.x - x, p.z - z);
}

function spawnPointNearPlayer(minD, maxD) {
  const p = Solara.player;
  const a = Math.random() * Math.PI * 2;
  const d = minD + Math.random() * (maxD - minD);
  const x = clamp(p.x + Math.cos(a) * d, -CITY.groundHalf + 10, CITY.beachStart - 10);
  const z = clamp(p.z + Math.sin(a) * d, -CITY.groundHalf + 10, CITY.groundHalf - 10);
  return { x, z };
}

// --- unit meshes ------------------------------------------------------------
function makeOfficerMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1d2f55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.45), navy);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  head.position.y = 1.75;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10), navy);
  cap.position.y = 1.98;
  g.add(cap);
  for (const sx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.28), navy);
    leg.position.set(sx, 0.35, 0);
    g.add(leg);
  }
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
  badge.position.set(0.2, 1.3, 0.26);
  g.add(badge);
  return g;
}

function makePoliceCarMesh() {
  const g = createCarMesh(0xf2f2f2, 'sedan');
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  red.position.set(-0.45, 1.75, -0.2);
  g.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
  blue.position.set(0.45, 1.75, -0.2);
  g.add(blue);
  return g;
}

function makeHeliMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d2f55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5.2), white);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 1.6), dark);
  nose.position.set(0, -0.2, 3.0);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5.0), white);
  tail.position.set(0, 0.3, -4.6);
  g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7), dark);
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.5), dark);
  tailRotor.position.set(0.45, 0.4, -6.8);
  g.add(tailRotor);
  // Spotlight cone: apex at the heli, opening downward toward the street.
  const coneGeo = new THREE.ConeGeometry(7, 46, 20, 1, true);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  }));
  cone.position.y = -23;
  cone.rotation.x = Math.PI; // cone points down
  cone.name = 'spotlight';
  g.add(cone);
  return g;
}

// --- spawning -----------------------------------------------------------------
function spawnPoliceCar() {
  const { x, z } = spawnPointNearPlayer(55, 90);
  const mesh = makePoliceCarMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const car = { mesh, color: 0xf2f2f2, kind: 'sedan', driver: 'police', speed: 0, heading: Math.random() * Math.PI * 2, x, z, stolen: false, hp: 100, police: true };
  cars.push(car);
  const unit = {
    kind: 'car', name: nextName(), mesh, car, x, z,
    status: 'responding', shootCd: 1 + Math.random(), patrolTarget: null,
  };
  P.units.push(unit);
  return unit;
}

function spawnFootOfficer() {
  const { x, z } = spawnPointNearPlayer(35, 60);
  const mesh = makeOfficerMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const unit = {
    kind: 'foot', name: nextName(), mesh, x, z, heading: 0,
    status: 'responding', shootCd: 1.5 + Math.random(), speed: 0,
  };
  P.units.push(unit);
  return unit;
}

function spawnHeli() {
  const p = Solara.player;
  const mesh = makeHeliMesh();
  mesh.position.set(p.x + 14, 44, p.z + 14);
  scene.add(mesh);
  const unit = { kind: 'heli', name: 'Air One', mesh, x: mesh.position.x, z: mesh.position.z, status: 'pursuing' };
  P.units.push(unit);
  P.heli = unit;
  return unit;
}

function removeUnit(unit) {
  const i = P.units.indexOf(unit);
  if (i >= 0) P.units.splice(i, 1);
  if (unit.mesh) scene.remove(unit.mesh);
  if (unit.car) {
    const ci = cars.indexOf(unit.car);
    if (ci >= 0) cars.splice(ci, 1);
  }
  if (P.heli === unit) P.heli = null;
}

function spawnRoadblock() {
  const p = Solara.player;
  const ahead = p.heading || 0;
  const bx = p.x + Math.sin(ahead) * 42;
  const bz = p.z + Math.cos(ahead) * 42;
  const group = new THREE.Group();
  const barrierMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const off of [-4.5, 4.5]) {
    const m = makePoliceCarMesh();
    m.position.set(Math.cos(ahead) * off, 0, -Math.sin(ahead) * off);
    m.rotation.y = ahead + Math.PI / 2;
    group.add(m);
  }
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(10, 1.1, 0.5), barrierMat);
  barrier.position.y = 0.8;
  group.add(barrier);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 0.52), stripeMat);
  stripe.position.y = 0.9;
  group.add(stripe);
  group.position.set(clamp(bx, -CITY.groundHalf + 10, CITY.beachStart - 10), 0, clamp(bz, -CITY.groundHalf + 10, CITY.groundHalf - 10));
  group.rotation.y = ahead;
  scene.add(group);
  P.roadblock = { mesh: group, x: group.position.x, z: group.position.z, heading: ahead };
}

function removeRoadblock() {
  if (!P.roadblock) return;
  scene.remove(P.roadblock.mesh);
  P.roadblock = null;
}

// --- per-frame unit behaviour ---------------------------------------------------
function steerToward(car, tx, tz, dt, throttle) {
  const desired = Math.atan2(tx - car.x, tz - car.z);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 2.2, -1, 1);
  updateCar(car, throttle, steer, dt);
}

function updatePoliceCar(unit, dt) {
  const p = Solara.player;
  const car = unit.car;
  const d = Math.hypot(p.x - car.x, p.z - car.z);
  if (P.wanted === 0) {
    // Clean streets: slow patrol cruise toward a wandering target.
    if (!unit.patrolTarget || Math.hypot(unit.patrolTarget.x - car.x, unit.patrolTarget.z - car.z) < 12) {
      unit.patrolTarget = { x: (Math.random() * 2 - 1) * 200, z: (Math.random() * 2 - 1) * 200 };
    }
    steerToward(car, unit.patrolTarget.x, unit.patrolTarget.z, dt, 0.35);
    unit.status = 'patrol';
    return;
  }
  unit.status = d < 26 ? 'pursuing' : 'responding';
  const tx = p.inCar ? p.inCar.x : p.x;
  const tz = p.inCar ? p.inCar.z : p.z;
  // Ram the player's car; on foot, stop just short and let foot units close in.
  const throttle = p.inCar ? (d > 6 ? 1 : 0.9) : (d > 9 ? 1 : 0.15);
  steerToward(car, tx, tz, dt, throttle);
}

function updateFootOfficer(unit, dt) {
  const p = Solara.player;
  const d = Math.hypot(p.x - unit.x, p.z - unit.z);
  unit.status = d < 20 ? 'pursuing' : 'responding';
  if (P.wanted === 0) {
    // No heat: officer walks back to a street corner and stands down.
    unit.speed = 0;
    return;
  }
  const speed = 7.2; // a touch slower than the player's sprint, so escape is possible
  const dx = p.x - unit.x;
  const dz = p.z - unit.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = unit.x + (dx / len) * speed * dt;
  const nz = unit.z + (dz / len) * speed * dt;
  if (!hitsBuilding(nx, unit.z, 0.7)) unit.x = nx;
  if (!hitsBuilding(unit.x, nz, 0.7)) unit.z = nz;
  unit.heading = Math.atan2(dx, dz);
  unit.mesh.position.set(unit.x, 0, unit.z);
  unit.mesh.rotation.y = unit.heading;
  unit.speed = speed;
  // Armed response: shoot at the player inside 30 m.
  if (d < 30 && !p.inCar) {
    unit.shootCd -= dt;
    if (unit.shootCd <= 0) {
      unit.shootCd = 1.1 + Math.random() * 0.7;
      Solara.combat.hurt?.(5 + Math.random() * 4);
      Solara.combat.tracer?.(
        { x: unit.x, y: 1.4, z: unit.z },
        { x: p.x, y: 1.2, z: p.z },
        0xffd24d,
      );
    }
  }
}

function updateHeli(dt) {
  const heli = P.heli;
  if (!heli) return;
  const p = Solara.player;
  const targetX = p.x + 12;
  const targetZ = p.z + 12;
  heli.mesh.position.x += (targetX - heli.mesh.position.x) * Math.min(1, dt * 1.4);
  heli.mesh.position.z += (targetZ - heli.mesh.position.z) * Math.min(1, dt * 1.4);
  heli.mesh.position.y = 44 + Math.sin(Solara.time * 0.8) * 1.5;
  heli.x = heli.mesh.position.x;
  heli.z = heli.mesh.position.z;
  const rotor = heli.mesh.getObjectByName('rotor');
  if (rotor) rotor.rotation.y += dt * 22;
  // Spotlight cone tracks the player: tilt the whole heli slightly toward them.
  const dx = p.x - heli.mesh.position.x;
  const dz = p.z - heli.mesh.position.z;
  heli.mesh.rotation.z = clamp(dx * 0.004, -0.2, 0.2);
  heli.mesh.rotation.x = clamp(-dz * 0.004, -0.2, 0.2);
  heli.mesh.rotation.y = Math.atan2(dx, dz);
  heli.status = 'pursuing';
}

function updateBusted(dt) {
  const p = Solara.player;
  if (!p || p.inCar || Solara.combat.down) {
    P.bustedTimer = 0;
    return;
  }
  let nearest = 9999;
  for (const u of P.units) {
    if (u.kind !== 'foot') continue;
    nearest = Math.min(nearest, Math.hypot(p.x - u.x, p.z - u.z));
  }
  const playerSpeed = p.speed || 0;
  if (nearest < 3.5 && playerSpeed < 1.5 && P.wanted > 0) {
    P.bustedTimer += dt;
    if (P.bustedTimer > 2.5) {
      P.bustedTimer = 0;
      Solara.combat.requestBusted = true;
    }
  } else {
    P.bustedTimer = Math.max(0, P.bustedTimer - dt * 2);
  }
}

function refreshDispatch() {
  const p = Solara.player;
  P.dispatch = P.units.map((u) => ({
    name: u.name,
    distance: p ? Math.round(Math.hypot(p.x - u.x, p.z - u.z)) : 0,
    status: u.status,
  }));
}

// --- the updater ------------------------------------------------------------------
function updatePolice(dt, t) {
  const p = Solara.player;
  if (!p) return;

  // Heat decays: fast when no unit can see the player, slow while pursued.
  let nearestUnit = 9999;
  for (const u of P.units) nearestUnit = Math.min(nearestUnit, Math.hypot(p.x - u.x, p.z - u.z));
  if (nearestUnit > 55) {
    P.heat = Math.max(0, P.heat - 2.5 * dt);
    P.lastSeenAt = t;
  } else {
    P.heat = Math.max(0, P.heat - 0.4 * dt);
  }
  const w = wantedFromHeat(P.heat);
  if (w !== P.wanted) {
    P.wanted = w;
    Solara.stars = w;
  }

  // Field / stand down units to match the wanted level.
  P._spawnCd -= dt;
  const wantCars = P.wanted === 0 ? PATROL_CARS_CLEAN : Math.min(UNITS_FOR_WANTED[P.wanted], P.wanted >= 2 ? 3 : 2);
  const wantFoot = P.wanted >= 2 ? Math.min(UNITS_FOR_WANTED[P.wanted] - wantCars, 3) : 0;
  const carCount = P.units.filter((u) => u.kind === 'car').length;
  const footCount = P.units.filter((u) => u.kind === 'foot').length;
  if (P._spawnCd <= 0) {
    if (carCount < wantCars) { spawnPoliceCar(); P._spawnCd = 0.6; }
    else if (footCount < wantFoot) { spawnFootOfficer(); P._spawnCd = 0.6; }
    else if (carCount > wantCars) {
      const extra = P.units.filter((u) => u.kind === 'car').sort((a, b) => distToPlayer(b.x, b.z) - distToPlayer(a.x, a.z))[0];
      if (extra) removeUnit(extra);
      P._spawnCd = 0.6;
    } else if (footCount > wantFoot) {
      const extra = P.units.filter((u) => u.kind === 'foot').sort((a, b) => distToPlayer(b.x, b.z) - distToPlayer(a.x, a.z))[0];
      if (extra) removeUnit(extra);
      P._spawnCd = 0.6;
    }
  }

  // Helicopter at wanted >= 4.
  if (P.wanted >= 4 && !P.heli) spawnHeli();
  if (P.wanted < 4 && P.heli) removeUnit(P.heli);

  // Roadblock at wanted >= 3.
  if (P.wanted >= 3 && !P.roadblock) spawnRoadblock();
  if (P.wanted < 3 && P.roadblock) removeRoadblock();
  if (P.roadblock && distToPlayer(P.roadblock.x, P.roadblock.z) > 120) {
    removeRoadblock();
    spawnRoadblock();
  }

  for (const u of [...P.units]) {
    if (u.kind === 'car') updatePoliceCar(u, dt);
    else if (u.kind === 'foot') updateFootOfficer(u, dt);
  }
  if (P.heli) updateHeli(dt);
  updateBusted(dt);

  P._dispatchCd -= dt;
  if (P._dispatchCd <= 0) {
    refreshDispatch();
    P._dispatchCd = 0.25;
  }
}

Solara.updaters.push(updatePolice);

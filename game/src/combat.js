// SOLARA COVE — combat.js
// One job: fighting. Shooting on foot and drive-by (mouse click or F),
// armed enemies (Cove Kings gang + armed Solara PD), player health with
// slow regen, car damage -> burning -> explosion with area damage, and the
// WASTED / BUSTED flow with respawn. WASTED/BUSTED keep working when the
// main loop stops calling updaters (phase != PLAY) because the overlay and
// the respawn run on a DOM element + setTimeout, not on the frame loop.
// Police asks for a bust through Solara.combat.requestBusted; this module
// is the only one that flips Solara.combat.down.

import { Solara, clamp } from './config.js';
import { scene, camState } from './render.js';
import { keys, wasPressed } from './input.js';
import { cars } from './vehicles.js';
import { addHeat } from './police.js';

// --- state (extends the stub declared in config.js) --------------------------
const C = Solara.combat;
C.enemies = C.enemies ?? [];
C.health = 100;
C.maxHealth = 100;
C.down = null; // 'WASTED' | 'BUSTED' | null
C.requestBusted = false;
C.lastDamageAt = -99;
C._fireCd = 0;
C._tracerT = 0;
C._enemyTracerT = 0;
C._respawnTimer = null;

const FIRE_RANGE = 46;
const FIRE_DAMAGE = 34;
const FIRE_RATE = 0.13;

// --- WASTED / BUSTED overlay (DOM, survives the phase change) ----------------
let overlay = null;
let overlayTitle = null;
let overlaySub = null;
function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'down-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(10,8,14,0.82);z-index:60;font-family:Arial,sans-serif;';
  overlayTitle = document.createElement('div');
  overlayTitle.style.cssText = 'font-size:84px;font-weight:900;letter-spacing:6px;color:#ff3b30;text-shadow:0 0 24px rgba(255,59,48,0.7);';
  overlaySub = document.createElement('div');
  overlaySub.style.cssText = 'margin-top:14px;font-size:20px;color:#f2ede4;';
  overlay.appendChild(overlayTitle);
  overlay.appendChild(overlaySub);
  document.body.appendChild(overlay);
}

function showDown(kind, sub) {
  ensureOverlay();
  overlayTitle.textContent = kind;
  overlayTitle.style.color = kind === 'BUSTED' ? '#4da3ff' : '#ff3b30';
  overlaySub.textContent = sub;
  overlay.style.display = 'flex';
}

function hideDown() {
  if (overlay) overlay.style.display = 'none';
}

function respawn() {
  const p = Solara.player;
  if (p) {
    p.x = 0;
    p.z = 8;
    p.y = 0;
    p.vy = 0;
    p.inCar = null;
    p.speed = 0;
    p.mesh.visible = true;
    p.mesh.position.set(0, 0, 8);
  }
  C.health = C.maxHealth;
  C.down = null;
  C.requestBusted = false;
  C.lastDamageAt = Solara.time;
  Solara.police.heat = 0;
  Solara.police.wanted = 0;
  Solara.stars = 0;
  hideDown();
  Solara.phase = 'PLAY';
}

function triggerWasted() {
  if (C.down || Solara.phase !== 'PLAY') return;
  C.down = 'WASTED';
  Solara.phase = 'WASTED';
  Solara.cash = Math.max(0, Solara.cash - Math.floor(Solara.cash * 0.1));
  showDown('WASTED', 'Mara Voss is back on her feet — the Cove keeps moving.');
  C._respawnTimer = setTimeout(respawn, 3500);
}

function triggerBusted() {
  if (C.down || Solara.phase !== 'PLAY') return;
  C.down = 'BUSTED';
  Solara.phase = 'BUSTED';
  const fine = Math.floor(Solara.cash * 0.15);
  Solara.cash = Math.max(0, Solara.cash - fine);
  showDown('BUSTED', `Solara PD took $${fine} in fines — and let Mara walk.`);
  C._respawnTimer = setTimeout(respawn, 3500);
}

/** Damage the player; triggers WASTED at 0 health. Safe to call from police.js. */
export function hurt(amount) {
  if (C.down || Solara.phase !== 'PLAY') return;
  C.health = Math.max(0, C.health - amount);
  C.lastDamageAt = Solara.time;
  if (C.health <= 0) triggerWasted();
}
C.hurt = hurt;

// --- tracers ---------------------------------------------------------------------
let tracer = null;
let enemyTracer = null;
function ensureTracers() {
  if (tracer) return;
  const geo = new THREE.BoxGeometry(0.09, 0.09, 1);
  tracer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  tracer.visible = false;
  scene.add(tracer);
  enemyTracer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff6a3d }));
  enemyTracer.visible = false;
  scene.add(enemyTracer);
}

function showTracer(from, to, color) {
  ensureTracers();
  const m = color === 0xffd24d || color === 0xff6a3d ? enemyTracer : tracer;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  m.scale.set(1, 1, len);
  m.lookAt(to.x, to.y, to.z);
  m.visible = true;
  if (m === tracer) C._tracerT = 0.07;
  else C._enemyTracerT = 0.07;
}
C.tracer = showTracer;

// --- enemies ---------------------------------------------------------------------
const GANG_COLORS = { body: 0x7a2e6d, pants: 0x2a2a30, skin: 0xc98d64 };
const COP_COLORS = { body: 0x1d2f55, pants: 0x1d2f55, skin: 0xd9a077 };

function makeEnemyMesh(kind) {
  const cols = kind === 'cop' ? COP_COLORS : GANG_COLORS;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: cols.body });
  const pantsMat = new THREE.MeshLambertMaterial({ color: cols.pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: cols.skin });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.45), bodyMat);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skinMat);
  head.position.y = 1.75;
  g.add(head);
  for (const sx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.28), pantsMat);
    leg.position.set(sx, 0.35, 0);
    g.add(leg);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x141416 }));
  gun.position.set(0.3, 1.2, 0.4);
  gun.name = 'gun';
  g.add(gun);
  if (kind === 'gang') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.48), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    band.position.y = 1.45;
    g.add(band);
  }
  return g;
}

/** Spawn an armed enemy at (x, z). kind: 'gang' (Cove Kings) | 'cop'. */
export function spawnEnemy(x, z, kind = 'gang') {
  const mesh = makeEnemyMesh(kind);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const e = {
    kind, mesh, x, z, heading: Math.random() * Math.PI * 2,
    hp: 100, alive: true, shootCd: 1 + Math.random(), fallT: 0,
  };
  C.enemies.push(e);
  return e;
}
C.spawnEnemy = spawnEnemy;

function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  e.fallT = 0;
  e.mesh.rotation.x = -Math.PI / 2;
  e.mesh.position.y = 0.35;
  addHeat(e.kind === 'cop' ? 6 : 2);
}

function updateEnemies(dt) {
  const p = Solara.player;
  for (const e of [...C.enemies]) {
    if (!e.alive) {
      e.fallT += dt;
      if (e.fallT > 2.5) {
        scene.remove(e.mesh);
        C.enemies.splice(C.enemies.indexOf(e), 1);
      }
      continue;
    }
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < 48) {
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const len = Math.hypot(dx, dz) || 1;
      if (d > 13) {
        const speed = e.kind === 'cop' ? 6.4 : 5.6;
        e.x += (dx / len) * speed * dt;
        e.z += (dz / len) * speed * dt;
      }
      e.heading = Math.atan2(dx, dz);
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      if (d < 32) {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = 1.2 + Math.random() * 0.7;
          hurt(4 + Math.random() * 5);
          showTracer({ x: e.x, y: 1.4, z: e.z }, { x: p.x, y: 1.2, z: p.z }, 0xff6a3d);
        }
      }
    }
  }
}

// --- shooting --------------------------------------------------------------------
function aimDir() {
  return { x: -Math.sin(camState.yaw), z: -Math.cos(camState.yaw) };
}

function angleTo(dir, tx, tz, ox, oz) {
  const dx = tx - ox;
  const dz = tz - oz;
  const len = Math.hypot(dx, dz) || 1;
  const dot = (dx / len) * dir.x + (dz / len) * dir.z;
  return Math.acos(clamp(dot, -1, 1));
}

function tryShoot() {
  if (C.down || Solara.phase !== 'PLAY') return;
  if (C._fireCd > 0) return;
  C._fireCd = FIRE_RATE;
  const p = Solara.player;
  const origin = p.inCar
    ? { x: p.inCar.x, y: 1.4, z: p.inCar.z }
    : { x: p.x, y: 1.5, z: p.z };
  const dir = aimDir();
  let end = { x: origin.x + dir.x * FIRE_RANGE, y: origin.y, z: origin.z + dir.z * FIRE_RANGE };
  let bestD = FIRE_RANGE;

  for (const e of C.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - origin.x, e.z - origin.z);
    if (d < bestD && angleTo(dir, e.x, e.z, origin.x, origin.z) < 0.11) {
      bestD = d;
      end = { x: e.x, y: 1.3, z: e.z };
      e.hp -= FIRE_DAMAGE;
      if (e.hp <= 0) killEnemy(e);
    }
  }
  for (const car of cars) {
    if (car === p.inCar || car.exploded) continue;
    const d = Math.hypot(car.x - origin.x, car.z - origin.z);
    if (d < bestD && angleTo(dir, car.x, car.z, origin.x, origin.z) < 0.13) {
      bestD = d;
      end = { x: car.x, y: 1.0, z: car.z };
      damageCar(car, FIRE_DAMAGE);
    }
  }
  showTracer(origin, end, 0xffe14d);
  if (bestD < FIRE_RANGE) addHeat(0.6); // gunfire draws attention
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!document.pointerLockElement) return;
  tryShoot();
});

// --- car damage / burning / explosion --------------------------------------------
const carFx = new Map(); // car -> { flame, smoke[] }

function startBurning(car) {
  if (carFx.has(car)) return;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 }),
  );
  flame.position.set(car.x, 1.6, car.z);
  scene.add(flame);
  const smoke = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }),
    );
    s.position.set(car.x, 2 + i, car.z);
    scene.add(s);
    smoke.push(s);
  }
  carFx.set(car, { flame, smoke, t: 0 });
}

function stopBurning(car) {
  const fx = carFx.get(car);
  if (!fx) return;
  scene.remove(fx.flame);
  for (const s of fx.smoke) scene.remove(s);
  carFx.delete(car);
}

/** Damage a car; burning below 35 hp, explosion at 0. */
export function damageCar(car, amount) {
  if (car.exploded) return;
  car.hp = (car.hp ?? 100) - amount;
  if (car.hp <= 0) explodeCar(car);
  else if (car.hp < 35) startBurning(car);
}

function explodeCar(car) {
  car.exploded = true;
  car.speed = 0;
  car.driver = null;
  stopBurning(car);
  const p = Solara.player;
  if (p.inCar === car) {
    p.inCar = null;
    p.x = car.x + 3;
    p.z = car.z + 3;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
  }
  // Flash sphere, then a scorched wreck.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(5, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 0.9 }),
  );
  flash.position.set(car.x, 1.5, car.z);
  scene.add(flash);
  let ft = 0;
  const flashStep = () => {
    ft += 0.05;
    flash.scale.setScalar(1 + ft * 1.6);
    flash.material.opacity = Math.max(0, 0.9 - ft * 0.5);
    if (ft < 1.8) requestAnimationFrame(flashStep);
    else scene.remove(flash);
  };
  requestAnimationFrame(flashStep);
  car.mesh.traverse((m) => {
    if (m.isMesh && m.material && m.material.color) m.material.color.setHex(0x1a1a1c);
  });
  // Area damage: player + nearby enemies.
  if (p && Math.hypot(p.x - car.x, p.z - car.z) < 9) hurt(45);
  for (const e of C.enemies) {
    if (e.alive && Math.hypot(e.x - car.x, e.z - car.z) < 9) {
      e.hp -= 80;
      if (e.hp <= 0) killEnemy(e);
    }
  }
  addHeat(4);
}

function updateCarFx(dt) {
  for (const [car, fx] of [...carFx.entries()]) {
    if (car.exploded) { stopBurning(car); continue; }
    fx.t += dt;
    fx.flame.position.set(car.x, 1.6 + Math.sin(fx.t * 9) * 0.15, car.z);
    fx.flame.scale.set(1 + Math.sin(fx.t * 13) * 0.2, 1 + Math.sin(fx.t * 17) * 0.25, 1);
    fx.smoke.forEach((s, i) => {
      s.position.set(car.x + Math.sin(fx.t * 2 + i * 2) * 0.4, 2 + ((fx.t * 1.5 + i * 1.7) % 3), car.z);
      s.material.opacity = 0.55 - ((fx.t * 1.5 + i * 1.7) % 3) * 0.12;
    });
    // A burning player car keeps cooking: slow hp bleed until it blows.
    if (car.hp > 0) damageCar(car, 1.5 * dt);
  }
}

function updatePoliceRam(dt) {
  const p = Solara.player;
  if (!p || !p.inCar || p.inCar.exploded) return;
  for (const car of cars) {
    if (car.driver !== 'police' || car.exploded) continue;
    const d = Math.hypot(car.x - p.inCar.x, car.z - p.inCar.z);
    if (d < 4.2 && Math.abs(car.speed) > 4) {
      damageCar(p.inCar, 22 * dt);
    }
  }
}

// --- the updater -------------------------------------------------------------------
function updateCombat(dt, t) {
  if (C._fireCd > 0) C._fireCd -= dt;
  if (C._tracerT > 0) { C._tracerT -= dt; if (C._tracerT <= 0 && tracer) tracer.visible = false; }
  if (C._enemyTracerT > 0) { C._enemyTracerT -= dt; if (C._enemyTracerT <= 0 && enemyTracer) enemyTracer.visible = false; }

  // F fires too (mouse click is the primary trigger, wired above).
  if (wasPressed('KeyF')) tryShoot();

  // Slow health regen after 5 s without damage.
  if (!C.down && C.health > 0 && C.health < C.maxHealth && t - C.lastDamageAt > 5) {
    C.health = Math.min(C.maxHealth, C.health + 6 * dt);
  }

  updateEnemies(dt);
  updateCarFx(dt);
  updatePoliceRam(dt);

  // A bust requested by police.js lands here (still inside PLAY).
  if (C.requestBusted && !C.down) {
    C.requestBusted = false;
    triggerBusted();
  }
}

Solara.updaters.push(updateCombat);

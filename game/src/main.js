// SOLARA COVE — main.js
// One job: the game loop and the START -> PLAY state machine. Builds the
// player on foot, wires walking + driving + stealing cars, keeps the player
// out of buildings, tracks the current district, and calls every registered
// part-2/part-3 updater each frame. The start screen lives in index.html
// and calls window.Solara.startGame(); the pause menu calls resumeGame().

import { Solara, PLAYER, CITY, districtAt, clamp } from './config.js';
import { buildCity, colliders } from './city.js';
import { buildWorld, updateWorld } from './world.js';
import { spawnTraffic, updateCar, updateTraffic, nearestCar } from './vehicles.js';
import { installInput, keys, wasPressed, readLook, clearPressed } from './input.js';
import { initRenderer, updateCamera, renderFrame, applyLook, camState } from './render.js';

const canvas = document.getElementById('game');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const hintBar = document.getElementById('hint-bar');

const { scene } = initRenderer(canvas);
installInput(canvas);
buildWorld(scene);
buildCity(scene);
spawnTraffic(scene);

// --- the player on foot: a low-poly walker, teal jacket, dark trousers.
function createPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f8a70 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23262e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.45), jacket);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skin);
  head.position.y = 1.75;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xffc94d }));
  cap.position.y = 1.98;
  g.add(cap);
  for (const sx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.3), dark);
    leg.position.set(sx, 0.35, 0);
    leg.name = sx < 0 ? 'legL' : 'legR';
    g.add(leg);
  }
  return g;
}

const player = {
  mesh: createPlayerMesh(),
  x: 0,
  z: 8,
  y: 0,
  vy: 0,
  heading: 0,
  speed: 0,
  onGround: true,
  inCar: null,
  walkPhase: 0,
};
player.mesh.position.set(player.x, 0, player.z);
scene.add(player.mesh);
Solara.player = player;

function hitsBuilding(x, z, r) {
  for (const b of colliders) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return false;
}

function updateOnFoot(dt) {
  const look = readLook();
  applyLook(look.dx, look.dy);
  // Movement is relative to the camera yaw: W walks away from the camera.
  const fwd = { x: -Math.sin(camState.yaw), z: -Math.cos(camState.yaw) };
  const right = { x: -fwd.z, z: fwd.x };
  let mx = 0;
  let mz = 0;
  if (keys.KeyW || keys.ArrowUp) { mx += fwd.x; mz += fwd.z; }
  if (keys.KeyS || keys.ArrowDown) { mx -= fwd.x; mz -= fwd.z; }
  if (keys.KeyA || keys.ArrowLeft) { mx -= right.x; mz -= right.z; }
  if (keys.KeyD || keys.ArrowRight) { mx += right.x; mz += right.z; }
  const len = Math.hypot(mx, mz);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (len > 0) {
    mx /= len;
    mz /= len;
    const nx = player.x + mx * speed * dt;
    const nz = player.z + mz * speed * dt;
    if (!hitsBuilding(nx, player.z, PLAYER.radius)) player.x = nx;
    if (!hitsBuilding(player.x, nz, PLAYER.radius)) player.z = nz;
    player.heading = Math.atan2(mx, mz);
    player.walkPhase += dt * speed * 1.6;
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  // Jump + gravity, ground is y = 0 everywhere in the city.
  if (wasPressed('Space') && player.onGround) {
    player.vy = PLAYER.jumpSpeed;
    player.onGround = false;
  }
  player.vy -= PLAYER.gravity * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.onGround = true;
  }
  // Walk swing on the legs, so the walker reads as walking.
  const legL = player.mesh.getObjectByName('legL');
  const legR = player.mesh.getObjectByName('legR');
  const swing = player.speed > 0 ? Math.sin(player.walkPhase) * 0.55 : 0;
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.y = player.heading;

  // E near a car: steal it. E while driving: step out.
  if (wasPressed('KeyE')) {
    const car = nearestCar(player.x, player.z, 4.5);
    if (car) {
      player.inCar = car;
      car.driver = 'player';
      car.stolen = true;
      player.mesh.visible = false;
      showHint('You stole a car — W/S drive, A/D steer, Space handbrake, E to step out');
    }
  }
  Solara.district = districtAt(player.x, player.z);
}

function updateDriving(dt) {
  const car = player.inCar;
  const look = readLook();
  applyLook(look.dx, look.dy);
  const throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const steer = (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const handbrake = keys.Space;
  updateCar(car, handbrake ? 0 : throttle, steer, dt);
  if (handbrake) car.speed *= Math.max(0, 1 - 3 * dt);
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  if (wasPressed('KeyE')) {
    // Step out beside the car.
    player.inCar = null;
    car.driver = null;
    car.speed = 0;
    player.x = car.x + Math.cos(car.heading) * 2.5;
    player.z = car.z - Math.sin(car.heading) * 2.5;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
    showHint('On foot — WASD to walk, E near a car to steal it');
  }
  Solara.district = districtAt(player.x, player.z);
}

let hintTimer = null;
function showHint(text) {
  if (!hintBar) return;
  hintBar.textContent = text;
  hintBar.style.opacity = '1';
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { hintBar.style.opacity = '0.55'; }, 5000);
}

Solara.startGame = () => {
  Solara.phase = 'PLAY';
  if (startScreen) startScreen.style.display = 'none';
  if (pauseScreen) pauseScreen.style.display = 'none';
  canvas.requestPointerLock();
  showHint('Welcome to Solara Cove — WASD to walk, E near a car to steal it');
};

Solara.pauseGame = () => {
  if (Solara.phase !== 'PLAY') return;
  Solara.phase = 'PAUSED';
  if (pauseScreen) pauseScreen.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
};

Solara.resumeGame = () => {
  if (Solara.phase !== 'PAUSED') return;
  Solara.phase = 'PLAY';
  if (pauseScreen) pauseScreen.style.display = 'none';
  canvas.requestPointerLock();
};

document.getElementById('start-button')?.addEventListener('click', () => Solara.startGame());
document.getElementById('resume-button')?.addEventListener('click', () => Solara.resumeGame());
document.getElementById('restart-button')?.addEventListener('click', () => window.location.reload());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && Solara.phase === 'PLAY') Solara.pauseGame();
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0.001, 0.05);
  last = now;
  if (Solara.phase === 'PLAY') {
    Solara.time += dt;
    if (player.inCar) updateDriving(dt);
    else updateOnFoot(dt);
    updateTraffic(dt);
    for (const update of Solara.updaters) update(dt, Solara.time);
    updateCamera({ x: player.x, y: player.y, z: player.z, heading: player.heading }, dt);
  }
  updateWorld(dt, Solara.time);
  renderFrame();
  clearPressed();
}

requestAnimationFrame(frame);

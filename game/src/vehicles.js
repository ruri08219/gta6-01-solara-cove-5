// SOLARA COVE — vehicles.js
// One job: cars. Low-poly car models, parked and driving traffic on the
// street grid, and the arcade driving model the player uses once they
// steal a car (E to enter, E to exit — wired up in main.js).
// Part 2 adds police pursuit driving on top of the same updateCar step.

import { CAR, CITY, clamp } from './config.js';
import { colliders } from './city.js';

const CAR_COLORS = [0xc23b3b, 0x3b6fc2, 0xe8c33d, 0x3fae6a, 0xd8d8d8, 0x222226, 0xe07ba8, 0x7a4dc2];

/** Every car in the city, player-driven or traffic. */
export const cars = [];

/** Build one low-poly car group. `kind` is 'sedan' | 'taxi' | 'truck' | 'sport'. */
export function createCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141416 });
  const len = kind === 'truck' ? 5.6 : 4.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, len), bodyMat);
  body.position.y = 0.65;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, kind === 'truck' ? 1.4 : 2.1), glassMat);
  cabin.position.set(0, 1.3, kind === 'truck' ? 1.4 : -0.2);
  g.add(cabin);
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 1.8, -0.2);
    g.add(sign);
  }
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 2.6), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
    bed.position.set(0, 1.1, -1.3);
    g.add(bed);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  // Headlights, so a car reads at dusk.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const wx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat);
    lamp.position.set(wx, 0.7, len / 2 + 0.02);
    g.add(lamp);
  }
  return g;
}

/**
 * Spawn a car at (x, z) with a heading. `driver` is null (parked), 'traffic'
 * (drives its lane) or 'player' (driven from main.js).
 */
export function spawnCar(scene, x, z, heading = 0, driver = null, kind = 'sedan') {
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const mesh = createCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = { mesh, color, kind, driver, speed: 0, heading, x, z, stolen: false };
  cars.push(car);
  return car;
}

/** Parked cars along the curbs + a few moving traffic cars on the avenues. */
export function spawnTraffic(scene) {
  const pitch = CITY.blockSize + CITY.streetWidth;
  const span = CITY.blocks * pitch;
  for (let i = 0; i < 10; i++) {
    const lane = -span / 2 + Math.floor(Math.random() * (CITY.blocks + 1)) * pitch + CITY.streetWidth / 2;
    const along = -span / 2 + 20 + Math.random() * (span - 40);
    const horizontal = i % 2 === 0;
    const car = spawnCar(scene, horizontal ? along : lane + 5, horizontal ? lane + 5 : along, horizontal ? Math.PI / 2 : 0, null, i % 5 === 0 ? 'taxi' : 'sedan');
    car.mesh.rotation.y = horizontal ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
    car.heading = car.mesh.rotation.y;
  }
  for (let i = 0; i < 8; i++) {
    const lane = -span / 2 + Math.floor(Math.random() * (CITY.blocks + 1)) * pitch + CITY.streetWidth / 2;
    const along = -span / 2 + Math.random() * span;
    const horizontal = i % 2 === 0;
    const car = spawnCar(scene, horizontal ? along : lane, horizontal ? lane : along, 0, 'traffic', i % 4 === 0 ? 'truck' : 'sedan');
    car.speed = 8 + Math.random() * 5;
    car.horizontal = horizontal;
    car.direction = Math.random() < 0.5 ? 1 : -1;
  }
  return cars;
}

/** Arcade driving step: throttle -1..1, steer -1..1. Handles walls and buildings. */
export function updateCar(car, throttle, steer, dt) {
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) car.speed += CAR.brake * throttle * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
  if (Math.abs(car.speed) > 0.5) car.heading += steer * CAR.steer * dt * Math.sign(car.speed);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  if (!hitsBuilding(nx, nz)) {
    car.x = nx;
    car.z = nz;
  } else {
    car.speed *= -0.25;
  }
  car.x = clamp(car.x, -CITY.groundHalf, CITY.beachStart - 4);
  car.z = clamp(car.z, -CITY.groundHalf, CITY.groundHalf);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

function hitsBuilding(x, z) {
  for (const b of colliders) {
    if (x > b.x0 - 1.2 && x < b.x1 + 1.2 && z > b.z0 - 1.2 && z < b.z1 + 1.2) return true;
  }
  return false;
}

/** Traffic cars cruise their lane and wrap around the city edge. */
export function updateTraffic(dt) {
  const span = CITY.blocks * (CITY.blockSize + CITY.streetWidth);
  for (const car of cars) {
    if (car.driver !== 'traffic') continue;
    if (car.horizontal) {
      car.x += car.direction * car.speed * dt;
      car.heading = car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (car.x > span / 2) car.x = -span / 2;
      if (car.x < -span / 2) car.x = span / 2;
    } else {
      car.z += car.direction * car.speed * dt;
      car.heading = car.direction > 0 ? 0 : Math.PI;
      if (car.z > span / 2) car.z = -span / 2;
      if (car.z < -span / 2) car.z = span / 2;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

/** The nearest car to (x, z) within `maxDist` metres, or null. */
export function nearestCar(x, z, maxDist = 4) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// SOLARA COVE — world.js
// One job: everything that is not a building or a car — the sky and sun,
// the bay sea, street lamps, palm trees, drifting clouds, and the world
// state (time of day) that parts 2/3 read for wanted heat and radio mood.

import { CITY, PALETTE } from './config.js';

export const world = {
  sea: null,
  sun: null,
  clouds: [],
  lamps: [],
};

/** Build sky, lights, sea, lamps, palms and clouds into `scene`. */
export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(0xffd9a0, 180, 620);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  world.sun = sun;

  // The bay: a wide sea plane east of the beach, gently animated in updateWorld.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(600, CITY.groundHalf * 2 + 200, 24, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.beachStart + 320, CITY.seaLevel, 0);
  scene.add(sea);
  world.sea = sea;

  buildLamps(scene);
  buildPalms(scene);
  buildClouds(scene);
  return world;
}

function buildLamps(scene) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: PALETTE.lamp });
  const pitch = CITY.blockSize + CITY.streetWidth;
  const span = CITY.blocks * pitch;
  for (let i = 0; i <= CITY.blocks; i++) {
    for (let j = 0; j <= CITY.blocks; j += 2) {
      const x = -span / 2 + i * pitch + CITY.streetWidth / 2 + 8;
      const z = -span / 2 + j * pitch + CITY.streetWidth / 2 + 8;
      if (x > CITY.beachStart - 20) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), poleMat);
      pole.position.set(x, 3.5, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bulbMat);
      bulb.position.set(x, 7.1, z);
      scene.add(bulb);
      world.lamps.push(bulb);
    }
  }
}

function buildPalms(scene) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  // Palms line the beach and the Marina promenade.
  for (let k = 0; k < 26; k++) {
    const z = -250 + k * 20;
    const x = CITY.beachStart - 6 + (k % 2) * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = 0.12;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3.4, 7), leafMat);
    crown.position.set(x + 0.8, 8.2, z);
    scene.add(crown);
  }
}

function buildClouds(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let k = 0; k < 10; k++) {
    const cloud = new THREE.Group();
    for (let p = 0; p < 3; p++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + p * 2, 8, 6), mat);
      puff.position.set(p * 7 - 7, p % 2, 0);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(-260 + k * 55, 95 + (k % 3) * 12, -240 + ((k * 97) % 480));
    scene.add(cloud);
    world.clouds.push(cloud);
  }
}

/** Per-frame world motion: slow sea shimmer and clouds drifting over the bay. */
export function updateWorld(dt, t) {
  if (world.sea) {
    const pos = world.sea.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.08 + t * 0.9) * 0.35 + Math.cos(y * 0.06 + t * 0.6) * 0.3);
    }
    pos.needsUpdate = true;
    world.sea.geometry.computeVertexNormals();
  }
  for (const c of world.clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > 320) c.position.x = -320;
  }
}

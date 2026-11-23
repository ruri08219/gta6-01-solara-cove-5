// SOLARA COVE — city.js
// One job: build the bay city itself — ground, street grid, low-poly building
// blocks per district, the harbour piers, the beach, and two original
// landmarks: Solara Tower (Marina) and the Cove Lighthouse (Harbor).
// Also exports the building colliders (axis-aligned boxes) so the player and
// the cars can bump into the city instead of walking through it.

import { CITY, DISTRICTS, PALETTE, hash2 } from './config.js';

/** Building colliders as { x0, z0, x1, z1 }: filled by buildCity, read by main.js and vehicles.js. */
export const colliders = [];

/** The city group, for parts 2/3 to attach district props to. */
export const cityGroup = new THREE.Group();

const lambert = (color) => new THREE.MeshLambertMaterial({ color });

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  return m;
}

function districtOfBlock(bx, bz) {
  const pitch = CITY.blockSize + CITY.streetWidth;
  const cx = -((CITY.blocks * pitch) / 2) + bx * pitch + CITY.streetWidth + CITY.blockSize / 2;
  const cz = -((CITY.blocks * pitch) / 2) + bz * pitch + CITY.streetWidth + CITY.blockSize / 2;
  for (const d of DISTRICTS) {
    if (cx >= d.x0 && cx < d.x1 && cz >= d.z0 && cz < d.z1) return d;
  }
  return DISTRICTS[4];
}

function buildGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.groundHalf * 2 + 80, CITY.groundHalf * 2 + 80),
    lambert(PALETTE.grass),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  scene.add(ground);

  // Beach: a sand strip along the east edge, where the city meets the bay.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(70, CITY.groundHalf * 2 + 80),
    lambert(PALETTE.sand),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachStart + 20, 0.02, 0);
  scene.add(sand);
}

function buildRoads(scene) {
  const pitch = CITY.blockSize + CITY.streetWidth;
  const span = CITY.blocks * pitch + CITY.streetWidth;
  const roadMat = lambert(PALETTE.asphalt);
  // Avenues run north-south, streets east-west; every crossing is a junction.
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -span / 2 + i * pitch + CITY.streetWidth / 2;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.streetWidth, span), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.01, 0);
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.streetWidth), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.01, c);
    scene.add(h);
    // Centre dashes on the avenue.
    for (let s = -span / 2 + 12; s < span / 2; s += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5), lambert(PALETTE.asphaltLine));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(c, 0.03, s);
      scene.add(dash);
    }
  }
}

function buildBlock(bx, bz, scene) {
  const pitch = CITY.blockSize + CITY.streetWidth;
  const cx = -((CITY.blocks * pitch) / 2) + bx * pitch + CITY.streetWidth + CITY.blockSize / 2;
  const cz = -((CITY.blocks * pitch) / 2) + bz * pitch + CITY.streetWidth + CITY.blockSize / 2;
  // The east edge is beach, not buildings.
  if (cx > CITY.beachStart - 30) return;
  const d = districtOfBlock(bx, bz);
  const r = hash2(bx, bz);
  const group = new THREE.Group();
  if (d.name === 'Old Town') {
    // Low colourful rows, two or three houses per block.
    for (let k = 0; k < 3; k++) {
      const w = 10 + hash2(bx * 3 + k, bz) * 4;
      const h = 6 + hash2(bx, bz * 3 + k) * 6;
      const col = PALETTE.buildingBase[Math.floor(hash2(bx + k, bz) * PALETTE.buildingBase.length)];
      const b = box(w, h, 11, col, cx - 12 + k * 12, h / 2, cz - 8 + (k % 2) * 14);
      group.add(b);
      const roof = box(w + 0.6, 0.8, 11.6, 0x8a5a3a, cx - 12 + k * 12, h + 0.4, cz - 8 + (k % 2) * 14);
      group.add(roof);
      colliders.push({ x0: b.position.x - w / 2, z0: b.position.z - 5.5, x1: b.position.x + w / 2, z1: b.position.z + 5.5 });
    }
  } else if (d.name === 'Hillside') {
    // Stepped houses climbing a slope: each house sits higher than the last.
    for (let k = 0; k < 3; k++) {
      const h = 7 + k * 3 + r * 3;
      const b = box(12, h, 12, 0xcfd8c2, cx - 12 + k * 12, h / 2 + k * 1.6, cz);
      group.add(b);
      colliders.push({ x0: b.position.x - 6, z0: b.position.z - 6, x1: b.position.x + 6, z1: b.position.z + 6 });
    }
  } else {
    // One slab per block; Marina towers rise, Harbor keeps warehouses low.
    const tall = d.name === 'Marina' ? 26 + r * 30 : d.name === 'Downtown' ? 16 + r * 26 : 8 + r * 8;
    const w = 24 + r * 10;
    const col = d.color;
    const b = box(w, tall, w, col, cx, tall / 2, cz);
    group.add(b);
    // Lit window strips: thin emissive boxes on the slab faces.
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let f = 0; f < Math.min(6, Math.floor(tall / 6)); f++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.9, 0.4), winMat);
      strip.position.set(cx, 4 + f * 6, cz + w / 2 + 0.1);
      group.add(strip);
    }
    // Rooftop box.
    const roof = box(6, 2.4, 6, 0x555a63, cx, tall + 1.2, cz);
    group.add(roof);
    colliders.push({ x0: cx - w / 2, z0: cz - w / 2, x1: cx + w / 2, z1: cz + w / 2 });
  }
  scene.add(group);
}

function buildLandmarks(scene) {
  // Solara Tower — the Marina landmark, tallest in the city, sun-gold crown.
  const tower = box(26, 78, 26, 0x2fa8a0, 150, 39, -150);
  scene.add(tower);
  const crown = box(28, 4, 28, 0xffc94d, 150, 80, -150);
  scene.add(crown);
  colliders.push({ x0: 137, z0: -163, x1: 163, z1: -137 });

  // Cove Lighthouse — white-and-coral striped tower at the end of the Harbor pier.
  const pier = box(10, 2, 90, 0x7a6a55, -180, 1, 200);
  scene.add(pier);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.5, 34, 10), lambert(0xf2ede4));
  light.position.set(-180, 19, 238);
  scene.add(light);
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 10), new THREE.MeshBasicMaterial({ color: 0xffd76e }));
  lampRoom.position.set(-180, 38, 238);
  scene.add(lampRoom);
  colliders.push({ x0: -186, z0: 232, x1: -174, z1: 244 });
}

/** Build the whole city into `scene`. Call once, before the first frame. */
export function buildCity(scene) {
  buildGround(scene);
  buildRoads(scene);
  for (let bx = 0; bx < CITY.blocks; bx++) {
    for (let bz = 0; bz < CITY.blocks; bz++) buildBlock(bx, bz, scene);
  }
  buildLandmarks(scene);
  scene.add(cityGroup);
  return cityGroup;
}

/** The nearest street-grid centre line to a coordinate (for traffic lanes). */
export function nearestLane(v) {
  const pitch = CITY.blockSize + CITY.streetWidth;
  return Math.round(v / pitch) * pitch;
}

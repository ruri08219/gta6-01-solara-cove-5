// SOLARA COVE — spawn.js (Part 4)
// One job: unstick the player spawn. Part 1 spawns the player at (0, 8),
// which sits INSIDE the central Downtown slab's collider (block 4,4 spans
// x/z -5.7..19.7), so main.js's hitsBuilding blocks every step and the
// player can never move, steal a car, or reach a job. This module moves
// the player to the nearest clear street junction the first time the game
// enters PLAY — before the first frame renders — and only when the player
// is actually inside a collider, so it never touches a normal position or
// a loaded save that already stands clear.

import { Solara } from './config.js';
import { colliders } from './city.js';

// Avenue x=0 meets street z=-28: a junction, clear of every collider.
const JUNCTION = { x: 0, z: -28 };

let done = false;

function insideAnyCollider(x, z, r) {
  for (const b of colliders) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return false;
}

function unstickPlayer() {
  if (done) return;
  done = true;
  const p = Solara.player;
  if (!p) return;
  if (!insideAnyCollider(p.x, p.z, 0.6)) return;
  p.x = JUNCTION.x;
  p.z = JUNCTION.z;
  p.y = 0;
  p.vy = 0;
  p.speed = 0;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
}

Solara.updaters.push(unstickPlayer);

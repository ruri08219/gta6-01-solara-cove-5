// SOLARA COVE — minimap.js
// One job: the round minimap (2D canvas, built dynamically by JS). It draws
// the street grid, the sea and beach to the east, district labels, the
// player arrow (rotated to the heading), police units (blue/red), the
// pulsing yellow job marker, and traffic cars (white). Police dots are
// normally only shown near the player; Pip's "Eyes on the PD" ability
// (Solara.crew.revealUntil) reveals every unit for 10 seconds.
// The HUD (hud.js) reuses findMarkerPos() for the mission distance readout.

import { Solara, CITY, DISTRICTS } from './config.js';
import { scene } from './render.js';
import { cars } from './vehicles.js';

const SIZE = 180;
const WORLD = 560; // world coordinates -280..280 map onto the canvas
const SCALE = SIZE / WORLD;

let canvas = null;
let ctx2d = null;
let attached = false;
let markerCache = null; // { x, z } | null
let markerScanAt = -99;

function toMapX(x) {
  return (x + WORLD / 2) * SCALE;
}
function toMapZ(z) {
  return (z + WORLD / 2) * SCALE;
}

/** Position of the yellow 3D job marker, found by scanning the scene for the
 *  arrow object jobs.js attaches to it. Cached; rescanned twice a second. */
export function findMarkerPos() {
  const now = Solara.time;
  if (now - markerScanAt < 0.5 && markerCache !== undefined) return markerCache;
  markerScanAt = now;
  markerCache = null;
  if (!scene) return null;
  scene.traverse((obj) => {
    if (markerCache || obj.name !== 'arrow') return;
    let node = obj;
    let visible = true;
    while (node) {
      if (!node.visible) { visible = false; break; }
      node = node.parent;
    }
    if (visible && obj.parent) {
      markerCache = { x: obj.parent.position.x, z: obj.parent.position.z };
    }
  });
  return markerCache;
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.setAttribute('aria-label', 'Minimap of Solara Cove');
  canvas.style.cssText = 'width:180px;height:180px;border-radius:50%;border:3px solid rgba(255,214,110,0.85);box-shadow:0 0 0 2px rgba(0,0,0,0.5),0 4px 18px rgba(0,0,0,0.55);background:#0e1a24;display:block;';
  ctx2d = canvas.getContext('2d');
}

function attachCanvas() {
  if (attached) return;
  ensureCanvas();
  const slot = document.getElementById('minimap-slot');
  if (!slot) return; // HUD root not built yet; retry next frame
  slot.appendChild(canvas);
  attached = true;
}

function drawMinimap() {
  if (!ctx2d) return;
  const p = Solara.player;
  const g = ctx2d;
  g.clearRect(0, 0, SIZE, SIZE);

  // Clip to the circle.
  g.save();
  g.beginPath();
  g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  g.clip();

  // Ground.
  g.fillStyle = '#274b34';
  g.fillRect(0, 0, SIZE, SIZE);

  // Beach (east edge) + sea beyond it.
  g.fillStyle = '#e8d29a';
  g.fillRect(toMapX(CITY.beachStart), 0, SIZE - toMapX(CITY.beachStart), SIZE);
  g.fillStyle = '#1e7fa8';
  g.fillRect(toMapX(252), 0, SIZE - toMapX(252), SIZE);

  // City blocks (streets stay dark between them).
  const pitch = CITY.blockSize + CITY.streetWidth;
  const span = CITY.blocks * pitch;
  g.fillStyle = '#3a3f47';
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const bx = -span / 2 + i * pitch + CITY.streetWidth / 2;
      const bz = -span / 2 + j * pitch + CITY.streetWidth / 2;
      g.fillRect(toMapX(bx), toMapZ(bz), CITY.blockSize * SCALE, CITY.blockSize * SCALE);
    }
  }

  // District labels (tiny, at district centres).
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = '7px Arial, sans-serif';
  g.textAlign = 'center';
  for (const d of DISTRICTS) {
    const cx = toMapX((d.x0 + d.x1) / 2);
    const cz = toMapZ((d.z0 + d.z1) / 2);
    g.fillText(d.name.toUpperCase(), cx, cz);
  }

  // Traffic / parked cars (white dots).
  if (p) {
    for (const car of cars) {
      if (car.exploded || car.driver === 'police' || car === p.inCar) continue;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.arc(toMapX(car.x), toMapZ(car.z), 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Police units. Near units always; all units while Pip's reveal is live.
  const reveal = Solara.time < (Solara.crew.revealUntil || 0);
  for (const u of Solara.police.units) {
    const d = p ? Math.hypot(p.x - u.x, p.z - u.z) : 9999;
    if (!reveal && d > 140) continue;
    const r = reveal ? 4 : 3;
    g.fillStyle = u.kind === 'heli' ? '#ff3b30' : '#4da3ff';
    g.beginPath();
    g.arc(toMapX(u.x), toMapZ(u.z), r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    g.stroke();
  }

  // Job marker: pulsing yellow diamond.
  const marker = findMarkerPos();
  if (marker) {
    const pulse = 3.5 + Math.sin(Solara.time * 5) * 1.5;
    const mx = toMapX(marker.x);
    const mz = toMapZ(marker.z);
    g.fillStyle = '#ffd94d';
    g.beginPath();
    g.moveTo(mx, mz - pulse);
    g.lineTo(mx + pulse, mz);
    g.lineTo(mx, mz + pulse);
    g.lineTo(mx - pulse, mz);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 1;
    g.stroke();
  }

  // Player arrow (heading: 0 faces -z in world space, so rotate -heading).
  if (p) {
    const px = toMapX(p.x);
    const pz = toMapZ(p.z);
    g.save();
    g.translate(px, pz);
    g.rotate(-p.heading + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111111';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  g.restore();

  // North tick on the rim.
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = 'bold 9px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('N', SIZE / 2, 11);
}

function updateMinimap(dt, t) {
  attachCanvas();
  if (Solara.phase === 'START') return;
  drawMinimap();
}

ensureCanvas();
Solara.updaters.push(updateMinimap);

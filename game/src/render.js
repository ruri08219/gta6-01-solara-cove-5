// SOLARA COVE — render.js
// One job: the three.js renderer, scene and third-person camera. Owns the
// canvas, the resize handler and the follow-camera maths; the game loop in
// main.js only tells it where the player (or their car) is and which way
// they face.

import { CAMERA, clamp } from './config.js';

export let renderer = null;
export let scene = null;
export let camera = null;

/** Camera orbit state: yaw follows the player, pitch from the mouse. */
export const camState = { yaw: 0, pitch: 0.32 };

/** Create the renderer + scene + camera on `canvas`. Call once from main.js. */
export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(0, 12, -18);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

/** Apply a mouse-look delta to the orbit. Pitch stays above the street. */
export function applyLook(dx, dy) {
  camState.yaw -= dx * 0.0032;
  camState.pitch = clamp(camState.pitch + dy * 0.0024, -0.15, 1.1);
}

/**
 * Third-person follow: the camera sits behind the target at CAMERA.distance,
 * looks slightly ahead of it, and eases into place so driving feels smooth.
 * `target` is { x, y, z, heading }; when the player drives, pass the car.
 */
export function updateCamera(target, dt) {
  const yaw = camState.yaw;
  const cx = target.x - Math.sin(yaw) * CAMERA.distance;
  const cz = target.z - Math.cos(yaw) * CAMERA.distance;
  const cy = target.y + CAMERA.height + Math.sin(camState.pitch) * 6;
  const k = 1 - Math.exp(-CAMERA.lerp * dt);
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.y += (cy - camera.position.y) * k;
  camera.position.z += (cz - camera.position.z) * k;
  camera.lookAt(target.x, target.y + CAMERA.lookHeight, target.z);
}

/** Draw one frame. */
export function renderFrame() {
  renderer.render(scene, camera);
}

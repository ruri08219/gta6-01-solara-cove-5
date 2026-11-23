// SOLARA COVE — input.js
// One job: keyboard + mouse, nothing else. Tracks held keys, edge-triggered
// presses (E, R, Space), and pointer-lock mouse look. main.js reads this
// module every frame and clears the per-frame press set itself.

/** Held keys by KeyboardEvent.code: true while the key is down. */
export const keys = {};

/** Codes pressed since the last clear — edge-triggered actions read these. */
export const pressed = new Set();

/** Mouse look deltas accumulated since the last read, in pixels. */
export const mouse = { dx: 0, dy: 0, locked: false };

let installed = false;

/** The canvas pointer lock is requested from; call once from main.js. */
export function installInput(canvas) {
  if (installed) return;
  installed = true;

  window.addEventListener('keydown', (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });

  canvas.addEventListener('click', () => {
    if (!mouse.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
}

/** True while any of the given codes is held. */
export function anyHeld(...codes) {
  return codes.some((c) => keys[c]);
}

/** True when the code was pressed since the last clear (edge-triggered). */
export function wasPressed(code) {
  return pressed.has(code);
}

/** Read and reset the accumulated mouse deltas. */
export function readLook() {
  const out = { dx: mouse.dx, dy: mouse.dy };
  mouse.dx = 0;
  mouse.dy = 0;
  return out;
}

/** Clear the per-frame press set; main.js calls this at the end of each frame. */
export function clearPressed() {
  pressed.clear();
}

// SOLARA COVE — config.js
// One job: every constant the city, the player and the cars share, plus the
// one global state object every later part of the game reads and writes.
// Parts 2 and 3 fill in the stubs they own (police, jobs, hud, audio, save);
// this file only declares the shape so part 1 never has to guess it.

export const CITY = {
  // The playable city is a 9 x 9 block grid centred on the origin.
  blocks: 9,
  blockSize: 42,
  streetWidth: 14,
  // Ground plane half-size; the beach and the sea start past the east edge.
  groundHalf: 260,
  seaLevel: -0.4,
  beachStart: 210,
  wallHeight: 60,
};

export const DISTRICTS = [
  { name: 'Marina', color: 0x2fa8a0, x0: 60, z0: -240, x1: 240, z1: -40, note: 'towers and the promenade' },
  { name: 'Old Town', color: 0xe8a33d, x0: -240, z0: -240, x1: -40, z1: -40, note: 'low colourful rows' },
  { name: 'Harbor', color: 0x4d7ea8, x0: -240, z0: 60, x1: -40, z1: 240, note: 'piers, cranes, the lighthouse' },
  { name: 'Hillside', color: 0x7fae5a, x0: 60, z0: 60, x1: 240, z1: 240, note: 'stepped houses on the slope' },
  { name: 'Downtown', color: 0x8d7fb8, x0: -40, z0: -40, x1: 60, z1: 60, note: 'the civic core' },
];

export const PALETTE = {
  skyTop: 0x2f7fc4,
  skyHorizon: 0xffd9a0,
  sun: 0xfff2c8,
  sea: 0x1e7fa8,
  sand: 0xe8d29a,
  grass: 0x6fae5e,
  asphalt: 0x33363d,
  asphaltLine: 0xf5d76e,
  sidewalk: 0x9a9a92,
  lamp: 0xffe9a8,
  buildingBase: [0xd8c9a8, 0xc9a689, 0xa8b8c9, 0xe0b48f, 0xb8c9a8, 0xd9a0a0],
};

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 10,
  jumpSpeed: 7,
  gravity: 20,
  radius: 0.6,
  eyeHeight: 1.7,
};

export const CAR = {
  accel: 22,
  brake: 34,
  maxSpeed: 38,
  reverseMax: 12,
  steer: 1.9,
  grip: 6,
};

export const CAMERA = {
  distance: 9,
  height: 4.2,
  lookHeight: 1.6,
  lerp: 8,
};

/** The one global game state. Every module imports this object (or reads window.Solara). */
export const Solara = (window.Solara ??= {
  version: 'solara-cove-1',
  // START -> PLAY -> PAUSED -> PLAY ... ; part 2 adds WASTED / BUSTED.
  phase: 'START',
  time: 0,
  clock: 12.5,
  cash: 250,
  stars: 0,
  respect: 0,
  rank: 'Nobody',
  district: 'Downtown',
  player: null,
  vehicles: [],
  traffic: [],
  pedestrians: [],
  // Part 2 owns these: police, wanted level, story jobs, combat.
  police: { units: [], wanted: 0, heat: 0, dispatch: [] },
  jobs: { list: [], active: null, done: 0 },
  combat: { enemies: [] },
  // Part 3 owns these: HUD, minimap, crew, radio, save, audio.
  hud: { dirty: true },
  crew: { members: [], active: null },
  radio: { station: 0, playing: false },
  save: { slot: null },
  audio: { muted: false },
  // Extension point: parts 2/3 register their updaters here; main.js calls each.
  updaters: [],
  startGame() {},
  pauseGame() {},
  resumeGame() {},
});

/** Which district contains (x, z); Downtown when on a border street. */
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  }
  return 'Downtown';
}

/** Clamp a value into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Small deterministic hash of two ints, for stable per-block variety. */
export function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

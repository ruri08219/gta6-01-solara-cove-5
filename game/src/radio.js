// SOLARA COVE — radio.js
// One job: the car / on-foot radio. Three original stations, all music
// synthesized live with WebAudio (oscillator bass + lead step patterns —
// no audio files, no network requests). R cycles stations. The ticker
// scrolls original Cove City news; the HUD reads Solara.radio to show
// the station, the current song, and the ticker text.

import { Solara } from './config.js';
import { wasPressed } from './input.js';

const R = Solara.radio;
R.station = R.station ?? 0;
R.playing = false;
R.songIndex = 0;
R.tickerIndex = 0;
R.ticker = '';
R.song = '';

const STATIONS = [
  {
    name: 'Cove FM 98.2',
    tag: 'Sunset Drive',
    wave: 'triangle',
    bpm: 96,
    // 16-step bass (scale degrees, null = rest) and lead lines.
    bass: [0, null, 0, null, 3, null, 0, null, 5, null, 3, null, 4, null, 2, null],
    lead: [7, null, 9, 7, null, 12, null, 9, 7, null, 5, null, 7, 9, null, null],
    root: 110,
    songs: ['Golden Hour Run', 'Palms at Dusk', 'Marina Lights'],
  },
  {
    name: 'Harbor Beats 104.7',
    tag: 'Night Shift',
    wave: 'sawtooth',
    bpm: 122,
    bass: [0, 0, null, 0, null, 0, 3, null, 0, 0, null, 0, 5, null, 3, 2],
    lead: [12, null, null, 12, null, 10, null, null, 9, null, 12, null, 14, null, 12, null],
    root: 98,
    songs: ['Crane Lights', 'Container Shuffle', 'Low Tide Bounce'],
  },
  {
    name: 'Old Town Talk 91.5',
    tag: 'Cove Talk',
    wave: 'sine',
    bpm: 80,
    bass: [0, null, null, 0, null, null, 4, null, 0, null, null, 0, null, 5, null, null],
    lead: [7, null, null, 9, null, null, 7, null, 5, null, null, 4, null, null, 2, null],
    root: 130,
    songs: ['Morning on the Plaza', 'The Old Town Hour', 'Cobblestone Stories'],
  },
];

const TICKER_ITEMS = [
  'COVE NEWS — The sun sets at 19:42 tonight; the Marina promenade stays open late.',
  'COVE NEWS — Solara PD reminds drivers: the Hillside road is closed for repairs until Friday.',
  'COVE NEWS — The Harbor fish market reports a record catch of silver bream this morning.',
  'COVE NEWS — Delgado’s courier service denies all rumours. Again. For the third time.',
  'COVE NEWS — Air One circles Downtown after reports of a stolen sedan. Locals wave.',
  'COVE NEWS — The lighthouse keeper swears he saw the tide glow gold last night.',
  'COVE NEWS — Cove Kings graffiti appears on the Old Town wall; the city paints over it by noon.',
  'COVE NEWS — Tonight at the Marina: free street food festival, bring your own appetite.',
];

const SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4, 5 / 2, 8 / 3, 3, 7 / 2, 4];

function stationDef() {
  return STATIONS[R.station % STATIONS.length];
}

function currentSong() {
  const st = stationDef();
  return st.songs[R.songIndex % st.songs.length];
}

function applyStation() {
  const st = stationDef();
  R.song = currentSong();
  R.ticker = TICKER_ITEMS[R.tickerIndex % TICKER_ITEMS.length];
  step = 0;
  nextNoteAt = 0;
}

let step = 0;
let nextNoteAt = 0;
let radioGain = null;
let songTimer = 0;
let tickerTimer = 0;

function noteFreq(degree, root) {
  return root * (SCALE[degree % SCALE.length] ?? 1);
}

function scheduleStep(ctx, when, st) {
  const bassDeg = st.bass[step % 16];
  const leadDeg = st.lead[step % 16];
  if (bassDeg !== null && bassDeg !== undefined) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = noteFreq(bassDeg, st.root);
    const stepDur = 60 / st.bpm / 4;
    g.gain.setValueAtTime(0.16, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + stepDur * 0.95);
    o.connect(g);
    g.connect(radioGain);
    o.start(when);
    o.stop(when + stepDur);
  }
  if (leadDeg !== null && leadDeg !== undefined) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = st.wave;
    o.frequency.value = noteFreq(leadDeg, st.root * 2);
    const stepDur = 60 / st.bpm / 4;
    g.gain.setValueAtTime(0.07, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + stepDur * 1.8);
    o.connect(g);
    g.connect(radioGain);
    o.start(when);
    o.stop(when + stepDur * 2);
  }
  step = (step + 1) % 16;
}

function updateRadio(dt, t) {
  // R cycles stations (edge-triggered).
  if (wasPressed('KeyR') && Solara.phase === 'PLAY') {
    R.station = (R.station + 1) % STATIONS.length;
    R.songIndex = 0;
    applyStation();
    Solara.audio.click?.();
  }

  const ctx = Solara.audio.ctx;
  const wantPlaying = Solara.phase === 'PLAY' && !!ctx;
  if (wantPlaying && !radioGain) {
    radioGain = ctx.createGain();
    radioGain.gain.value = Solara.audio.muted ? 0 : 0.9;
    radioGain.connect(Solara.audio.master);
    applyStation();
    nextNoteAt = ctx.currentTime + 0.1;
    R.playing = true;
  }
  if (!wantPlaying) {
    R.playing = false;
    return;
  }
  if (radioGain) radioGain.gain.value = Solara.audio.muted ? 0 : 0.9;

  // Step sequencer: schedule a little ahead of the audio clock.
  const st = stationDef();
  const stepDur = 60 / st.bpm / 4;
  if (nextNoteAt < ctx.currentTime - 0.5) nextNoteAt = ctx.currentTime + 0.05;
  while (nextNoteAt < ctx.currentTime + 0.18) {
    scheduleStep(ctx, Math.max(nextNoteAt, ctx.currentTime), st);
    nextNoteAt += stepDur;
  }

  // Rotate songs (~24 s) and ticker lines (~9 s).
  songTimer += dt;
  if (songTimer > 24) {
    songTimer = 0;
    R.songIndex = (R.songIndex + 1) % stationDef().songs.length;
    R.song = currentSong();
  }
  tickerTimer += dt;
  if (tickerTimer > 9) {
    tickerTimer = 0;
    R.tickerIndex = (R.tickerIndex + 1) % TICKER_ITEMS.length;
    R.ticker = TICKER_ITEMS[R.tickerIndex];
  }
}

// Initialise the visible radio state at module load.
R.song = currentSong();
R.ticker = TICKER_ITEMS[0];

Solara.updaters.push(updateRadio);

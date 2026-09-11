import { evalScope, setTime, Pattern, logger, repl as makeRepl } from '@strudel/core';
import { initAudio, registerSynthSounds, webaudioOutput, getAudioContext, samples, aliasBank } from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';
import { transpiler } from '@strudel/transpiler';
import { miniAllStrings } from '@strudel/mini';
import { getDrawContext, cleanupDraw } from '@strudel/draw';

// ---- tracks baked in at build time (sync-tracks.mjs copies ../liquid/*.txt to ./tracks) -----
const files = import.meta.glob('./tracks/*.txt', { query: '?raw', import: 'default', eager: true });
const tracks = Object.entries(files)
  .map(([path, code]) => {
    const title = (code.match(/^\/\/\s*"([^"]+)"/m) || [])[1] || path.split('/').pop();
    return { title, code, path };
  })
  .sort((a, b) => (a.title === 'Liquid Toolbox') - (b.title === 'Liquid Toolbox') || a.title.localeCompare(b.title));

// ---- visuals: one full-screen canvas behind the text, 1x pixel ratio to keep it cheap -------------
getDrawContext('test-canvas', { pixelRatio: 1 });
for (const n of ['pianoroll', 'scope', 'punchcard', 'spiral', 'pitchwheel']) {
  if (!Pattern.prototype['_' + n]) {
    Pattern.prototype['_' + n] = function (...args) {
      return this[n] ? this[n](...args) : this;
    };
  }
}
let visuals = true;
const stripVisuals = (code) => (visuals ? code : code.replace(/\._?(pianoroll|scope|tscope|punchcard|spiral|pitchwheel)\([^)]*\)/g, ''));
const slider = (v) => v;

// ---- engine ------------------------------------------------------------------------------------
const CDN = 'https://strudel.b-cdn.net';
let audioInit;
const ensureAudio = () => (audioInit ??= initAudio());
miniAllStrings();
// webaudioRepl() would close the context it just created (setAudioContext closes the previous one), so build it by hand
const repl = makeRepl({
  defaultOutput: webaudioOutput,
  getTime: () => getAudioContext().currentTime,
  transpiler,
  beforeEval: () => cleanupDraw(true),
  onToggle: (started) => {
    if (!started) cleanupDraw(true);
    setState(started);
  },
});
setTime(() => repl.scheduler.now());
const hush = () => repl.stop();
const evaluate = (code, autoplay = true) => repl.evaluate(stripVisuals(code), autoplay);

const ready = (async () => {
  await evalScope(
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/webaudio'),
    import('@strudel/soundfonts'),
    import('@strudel/draw'),
    { hush, evaluate, slider },
  );
  await Promise.all([
    registerSynthSounds(),
    registerSoundfonts(),
    samples(`${CDN}/piano.json`, `${CDN}/piano/`, { prebake: true }),
    samples(`${CDN}/tidal-drum-machines.json`, `${CDN}/tidal-drum-machines/machines/`, { prebake: true, tag: 'drum-machines' }),
  ]);
  aliasBank(`${CDN}/tidal-drum-machines-alias.json`);
})();

// ---- ui ------------------------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const code = $('code');
const log = $('log');
const state = $('state');
const nav = $('tracks');
let current = -1;

function setState(on) {
  state.textContent = on ? 'playing' : 'stopped';
  state.classList.toggle('on', on);
}
function say(msg, cls = '') {
  const line = document.createElement('div');
  line.textContent = msg;
  if (cls) line.className = cls;
  log.appendChild(line);
  while (log.childElementCount > 3) log.removeChild(log.firstChild);
}
document.addEventListener(logger.key, (e) => {
  const m = e.detail.message;
  say(m, /error/i.test(m) ? 'err' : '');
});

nav.replaceChildren(
  ...tracks.map((t, i) => {
    const a = document.createElement('a');
    a.innerHTML = `<i>${i + 1})</i>${t.title}`;
    a.onclick = () => load(i);
    return a;
  }),
);
function load(i) {
  current = (i + tracks.length) % tracks.length;
  code.value = tracks[current].code;
  [...nav.children].forEach((a, j) => a.classList.toggle('active', j === current));
  say(`loaded ${tracks[current].title}`, 'ok');
  code.scrollTop = 0;
}

async function play() {
  try {
    await ready;
    await ensureAudio();
    await evaluate(code.value);
    setState(true);
  } catch (err) {
    say(`error: ${err.message}`, 'err');
  }
}
function stop() {
  hush();
  setState(false);
}

$('play').onclick = play;
$('stop').onclick = stop;
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    play();
  } else if (e.key === '.') {
    e.preventDefault();
    stop();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    load(current + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    load(current - 1);
  } else if (e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    visuals = !visuals;
    say(`visuals ${visuals ? 'on' : 'off'} (takes effect on next play)`, 'ok');
  }
});

// #3 in the url opens the third track
const pick = parseInt(location.hash.slice(1), 10);
load(Number.isInteger(pick) && pick > 0 ? pick - 1 : 0);
ready.then(() => say('engine ready. pick a track, ctrl+enter to play.', 'ok')).catch((e) => say(`init failed: ${e.message}`, 'err'));

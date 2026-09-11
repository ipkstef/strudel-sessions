import { evalScope, logger } from '@strudel/core';
import { initAudio, registerSynthSounds, webaudioOutput, getAudioContext, samples, aliasBank } from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';
import { transpiler } from '@strudel/transpiler';
import { getDrawContext } from '@strudel/draw';
import { StrudelMirror, codemirrorSettings } from '@strudel/codemirror';

// ---- tracks baked in at build time (sync-tracks.mjs copies ../liquid/*.txt to ./tracks) -----
const files = import.meta.glob('./tracks/*.txt', { query: '?raw', import: 'default', eager: true });
const tracks = Object.entries(files)
  .map(([path, code]) => {
    const title = (code.match(/^\/\/\s*"([^"]+)"/m) || [])[1] || path.split('/').pop();
    return { title, code, path };
  })
  .sort((a, b) => (a.title === 'Liquid Toolbox') - (b.title === 'Liquid Toolbox') || a.title.localeCompare(b.title));

// ---- ui bits -----------------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const log = $('log');
const state = $('state');
const nav = $('tracks');
let current = -1;
let visuals = true;

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

// ---- engine + editor ---------------------------------------------------------------------------
// _pianoroll() / _scope() become inline widgets under their own line (the editor handles that);
// the full-screen canvas is only for the non-inline variants. 1x pixel ratio keeps it cheap.
const CDN = 'https://strudel.b-cdn.net';
const drawContext = getDrawContext('test-canvas', { pixelRatio: 1 });
let audioInit;
const ensureAudio = () => (audioInit ??= initAudio());
const stripVisuals = (code) => (visuals ? code : code.replace(/\._?(pianoroll|scope|tscope|punchcard|spiral|pitchwheel)\([^)]*\)/g, ''));
const slider = (v) => v;

const editor = new StrudelMirror({
  defaultOutput: webaudioOutput,
  getTime: () => getAudioContext().currentTime,
  transpiler,
  root: $('editor'),
  initialCode: '',
  drawTime: [-2, 2],
  drawContext,
  bgFill: false,
  autodraw: false,
  prebake: async () => {
    await evalScope(
      import('@strudel/core'),
      import('@strudel/mini'),
      import('@strudel/edo'),
      import('@strudel/tonal'),
      import('@strudel/webaudio'),
      import('@strudel/soundfonts'),
      import('@strudel/draw'),
      { slider },
    );
    await Promise.all([
      registerSynthSounds(),
      registerSoundfonts(),
      samples(`${CDN}/piano.json`, `${CDN}/piano/`, { prebake: true }),
      samples(`${CDN}/tidal-drum-machines.json`, `${CDN}/tidal-drum-machines/machines/`, { prebake: true, tag: 'drum-machines' }),
    ]);
    aliasBank(`${CDN}/tidal-drum-machines-alias.json`);
    say('engine ready. pick a track, ctrl+enter to play.', 'ok');
  },
  beforeEval: () => ensureAudio(),
  onToggle: (on) => setState(on),
});
// route the editor's own ctrl+enter through the visuals switch too
editor.evaluate = async function (autostart = true) {
  this.flash();
  await this.repl.evaluate(stripVisuals(this.code), autostart);
};
editor.updateSettings({
  ...codemirrorSettings.get(),
  theme: 'strudelTheme',
  fontSize: 15,
  fontFamily: 'monospace',
  isLineNumbersDisplayed: true,
  isAutoCompletionEnabled: false,
  isLineWrappingEnabled: false,
  isPatternHighlightingEnabled: true,
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
  editor.setCode(tracks[current].code);
  editor.setCursorLocation(0);
  [...nav.children].forEach((a, j) => a.classList.toggle('active', j === current));
  say(`loaded ${tracks[current].title}`, 'ok');
}

async function play() {
  try {
    await editor.evaluate();
  } catch (err) {
    say(`error: ${err.message}`, 'err');
  }
}
function stop() {
  editor.stop();
}

$('play').onclick = play;
$('stop').onclick = stop;
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === 'ArrowDown') {
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

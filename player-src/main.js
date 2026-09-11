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
  const live = liveMode ? ` live ${liveIdx}/${liveBlocks.length}` : '';
  state.textContent = (on ? 'playing' : 'stopped') + live;
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
  liveMode = false;
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
  clearTimeout(liveTimer);
  setState(false);
}

// ---- live-build mode (hidden): ctrl+shift+l, or #live in the url ---------------------------------
// splits the track into its header and its "$:" lanes, then reveals one lane at a time with a
// typewriter, re-evaluating after each, so it looks like the tune is being written on the spot.
// ctrl+shift+enter (or F9) reveals the next lane. #live=8 reveals one every 8 bars by itself.
let liveMode = false;
let liveBlocks = [];
let liveIdx = 0;
let liveHeader = '';
let liveTimer;
let liveEvery = 0; // bars between automatic reveals, 0 = manual
let typing = false;

function splitBlocks(src) {
  const lines = src.split('\n');
  const first = lines.findIndex((l) => /^\$:/.test(l));
  if (first < 0) return { header: src, blocks: [] };
  // header: everything before the first lane, minus trailing comment lines that belong to the first lane
  let h = first;
  while (h > 0 && /^\/\//.test(lines[h - 1])) h--;
  const header = lines.slice(0, h).join('\n').replace(/\s+$/, '');
  const blocks = [];
  let i = h;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const start = i;
    while (i < lines.length && /^\/\//.test(lines[i])) i++; // comments attached to the lane
    if (i < lines.length && /^\$:/.test(lines[i])) {
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) i++; // continuation lines
      blocks.push(lines.slice(start, i).join('\n'));
    } else {
      blocks.push(lines.slice(start, i).join('\n')); // stray comment, still shown
    }
  }
  return { header, blocks };
}

function barSeconds(header) {
  const m = header.match(/setcpm\(([^)]+)\)/) || header.match(/setcps\(([^)]+)\)/);
  if (!m) return 60 / 43;
  try {
    const v = Function(`return (${m[1]})`)();
    return header.includes('setcpm') ? 60 / v : 1 / v;
  } catch {
    return 60 / 43;
  }
}

function enterLive(every = 0) {
  const { header, blocks } = splitBlocks(code.value);
  if (!blocks.length) return say('nothing to build here', 'err');
  liveMode = true;
  liveBlocks = blocks;
  liveIdx = 0;
  liveHeader = header;
  liveEvery = every;
  code.value = header + '\n\n';
  code.scrollTop = code.scrollHeight;
  say(`live: ${blocks.length} lanes queued. ctrl+shift+enter reveals the next one${every ? `, or every ${every} bars` : ''}.`, 'ok');
  setState(false);
}

function typeText(text, cps = 90) {
  return new Promise((resolve) => {
    let i = 0;
    typing = true;
    const tick = () => {
      // type a few chars per frame; spaces and punctuation fly, letters land one at a time
      const n = 1 + Math.floor(Math.random() * 2);
      code.value += text.slice(i, i + n);
      i += n;
      code.scrollTop = code.scrollHeight;
      if (i < text.length) setTimeout(tick, 1000 / cps);
      else {
        typing = false;
        resolve();
      }
    };
    tick();
  });
}

async function revealNext() {
  if (!liveMode || typing) return;
  if (liveIdx >= liveBlocks.length) return say('all lanes are in.', 'ok');
  clearTimeout(liveTimer);
  const block = liveBlocks[liveIdx++];
  await typeText(block + '\n\n');
  await play();
  if (liveEvery && liveIdx < liveBlocks.length) {
    liveTimer = setTimeout(revealNext, liveEvery * barSeconds(liveHeader) * 1000);
  }
}

$('play').onclick = play;
$('stop').onclick = stop;
window.addEventListener('keydown', (e) => {
  if (e.key === 'F9') {
    e.preventDefault();
    return revealNext();
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    revealNext();
  } else if (e.key === 'Enter') {
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
  } else if (e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    liveMode ? load(current) : enterLive();
  } else if (e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    visuals = !visuals;
    say(`visuals ${visuals ? 'on' : 'off'} (takes effect on next play)`, 'ok');
  }
});

// url: #live or #live=8 turns on live mode for the first track, #3 picks a track
const hash = location.hash.slice(1);
const pick = parseInt(hash, 10);
load(Number.isInteger(pick) && pick > 0 ? pick - 1 : 0);
ready
  .then(() => {
    say('engine ready. pick a track, ctrl+enter to play.', 'ok');
    const m = hash.match(/^live(?:=(\d+))?$/);
    if (m) enterLive(m[1] ? parseInt(m[1], 10) : 0);
  })
  .catch((e) => say(`init failed: ${e.message}`, 'err'));

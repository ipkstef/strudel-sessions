# player-src

Source of the lightweight player in `../player`. Expects a strudel checkout next to this repo
(`../../strudel`, https://codeberg.org/uzu/strudel) with `pnpm install` and `pnpm run jsdoc-json`
done there, because the packages are linked from it and the editor package reads `doc.json`.

    pnpm install
    pnpm build      # copies ../liquid/*.txt into tracks/ and writes dist/
    pnpm preview    # serves dist/

The editor is Strudel's own CodeMirror setup, so `_pianoroll()` and `_scope()` draw inline under
their lane and active tokens light up while playing, like on strudel.cc. No docs panel, no
autocomplete, nothing else.

Keys: ctrl+enter play, ctrl+. stop, ctrl+up/down switch track, ctrl+shift+v visuals on/off
(off saves cpu on a weak machine). `#3` in the url opens the third track.

Launching without a browser window: `launch.cmd` (Windows) or `./launch.sh` in the repo root serves
`player/` and opens it in Chrome or Edge app mode, no tabs or address bar. `node launch.mjs 8123`
picks a port. Set `BROWSER` to a browser path if it isn't found.

The GitHub workflow in `.github/workflows/build-player.yml` does the same build on a runner and commits
`player/` back. Run it from the Actions tab, or it runs itself when `liquid/` or `player-src/` change.

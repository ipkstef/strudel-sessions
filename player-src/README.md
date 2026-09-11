# player-src

Source of the lightweight player in `../player`. Expects a strudel checkout next to this repo
(`../../strudel`, https://codeberg.org/uzu/strudel) with `pnpm install` done there, because the
packages are linked from it.

    pnpm install
    pnpm build      # copies ../liquid/*.txt into tracks/ and writes dist/
    pnpm preview    # serves dist/

Keys in the player: ctrl+enter play, ctrl+. stop, ctrl+up/down switch track, ctrl+shift+v visuals on/off.

Live-build mode (not shown in the ui): ctrl+shift+l on a loaded track, or open the player with `#live`.
The code is reduced to its header and the lanes are queued; ctrl+shift+enter or F9 types the next lane
in and re-evaluates. `#live=8` reveals a lane every 8 bars on its own. `#3` opens the third track.

The GitHub workflow in `.github/workflows/build-player.yml` does the same build on a runner and commits
`player/` back. Run it from the Actions tab, or it runs itself when `liquid/` or `player-src/` change.

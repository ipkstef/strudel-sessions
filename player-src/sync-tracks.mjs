// copies ../liquid/*.txt (or $TRACKS_DIR) into ./tracks so vite can bake them in
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve(process.env.TRACKS_DIR || '../liquid');
const dst = resolve('./tracks');
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.txt'));
for (const f of files) cpSync(join(src, f), join(dst, f));
console.log(`synced ${files.length} tracks from ${src}`);

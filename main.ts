// Coral Bay Heat — hand-in program for make.fun's "Make GTA 6" bounty (gta6-01).
//
// The game itself is the static site under game/ (open game/index.html in a desktop
// browser, no build step, no network). This program is only the courier: it copies
// game/ and screenshots/ into the output directory and writes dossier.json there
// with the vendored make.fun library, so the bytes the scorer rebuilds and the
// bytes handed in here can be compared exactly.
//
// Run it the way the grader does, or locally with an output override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this bounty; buildDossier refuses anything past them,
// which is what we want: better to fail here than to hand in an invalid entry.
const DOSSIER_CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

// A hand-in that cannot be judged is worse than no hand-in: check the two
// things the gate will check first, and fail loudly here instead.
const gameDir = join(repoRoot, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing: there is no game to hand in');
}
const shotNames = existsSync(join(repoRoot, 'screenshots'))
  ? readdirSync(join(repoRoot, 'screenshots')).filter((n) => /\.(png|jpe?g)$/i.test(n))
  : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`screenshots/ must hold 3 or 4 images, found ${shotNames.length}`);
}

mkdirSync(outputDir, { recursive: true });
copyTree(gameDir, join(outputDir, 'game'));

const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), shotsDir);
}

const dossierText = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossierText);

const shotCount = readdirSync(shotsDir).length;
console.log(`Coral Bay Heat handed in: ${shotCount} screenshots, dossier ${dossierText.length} bytes -> ${outputDir}`);

// Coral Bay Heat: the conductor. This module owns the game state and the
// frame loop — input, the order systems update in, who saw which crime, what
// a bust costs, when the game saves — and the draw stack that puts the city,
// its traffic and people, the light of the hour and the HUD on the canvas in
// that order. Every other module is a system; this one is the game.

import { WORLD, CAR_MODELS, SAVE_KEY, DAY_LENGTH_SECONDS, DAY_START_HOUR } from './config.js';
import { makeRng, clamp, lerp } from './util.js';
import { buildCity, landmarkById } from './city.js';
import { createAudio } from './audio.js';
import {
  makeCar, placeOnRoad, updateTraffic, collideCars, drawCar, attachEffects,
} from './vehicles.js';
import { makePeds, updatePeds, scarePeds, knockDown, drawPed } from './peds.js';
import { createPolice, reportCrime, updatePolice, clearWanted } from './police.js';
import { createPlayer, carInReach, enterCar, exitCar, updateOnFoot, updateDriving, drawPlayer } from './player.js';
import { STORY_JOBS, STORY_COUNT, makeBoardJob, updateJob } from './missions.js';
import { daylight, drawWorld, drawSkids } from './render.js';
import { drawMarker, drawHud, drawTitle, drawPause, drawBusted } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');
const view = { w: 1280, h: 800 };

function resize() {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = view.w;
  canvas.height = view.h;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- input
const input = {
  keys: new Set(),
  pressedSet: new Set(),
  mouseX: 0, mouseY: 0, mouseDown: false,
  down(code) { return this.keys.has(code); },
  pressed(code) { return this.pressedSet.has(code); },
};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) input.pressedSet.add(e.code);
  input.keys.add(e.code);
  game.audio.unlock();
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
canvas.addEventListener('pointermove', (e) => { input.mouseX = e.clientX; input.mouseY = e.clientY; });
canvas.addEventListener('pointerdown', (e) => {
  input.mouseDown = true;
  input.mouseX = e.clientX;
  input.mouseY = e.clientY;
  game.audio.unlock();
  handleClick(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => { input.mouseDown = false; });

// ---------------------------------------------------------------- effects
const particles = [];
const fx = {
  skid(x, y) {
    if (game.skids.length < 700) game.skids.push({ x, y, life: 13 });
  },
  sparks(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 130;
      particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4, max: 0.4, size: 2.2, color: '#ffca6a' });
    }
  },
  smoke(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      particles.push({ kind: 'smoke', x: x + (Math.random() - 0.5) * 14, y: y - 6, vx: (Math.random() - 0.5) * 12, vy: -26 - Math.random() * 22, life: 1.6, max: 1.6, size: 7 + Math.random() * 7, color: '#55565c' });
    }
  },
  crash(strength) { game.audio.crash(strength); },
  text(x, y, text, color = '#8be28b') {
    particles.push({ kind: 'text', x, y, vx: 0, vy: -34, life: 1.1, max: 1.1, size: 14, color, text });
  },
};
attachEffects(fx);

// ---------------------------------------------------------------- world building
const TRAFFIC_MODELS = CAR_MODELS.filter((m) => ['darter', 'voyager', 'mule', 'zephyr', 'cab'].includes(m.id));

function buildWorld(seed) {
  const city = buildCity(seed);
  const rng = makeRng(seed * 31 + 7);
  const cars = [];
  // Rolling traffic, already in its lanes.
  for (let i = 0; i < 15; i += 1) {
    const model = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
    const car = makeCar(model, 0, 0, 0, model.paints[Math.floor(rng() * model.paints.length)], model.id === 'cab' ? 'cab' : 'traffic');
    const vertical = rng() < 0.5;
    const index = Math.floor(rng() * (vertical ? 7 : 6));
    const along = 240 + rng() * (vertical ? WORLD.height - 480 : WORLD.width - 700);
    placeOnRoad(car, vertical, index, rng() < 0.5 ? 1 : -1, along);
    cars.push(car);
  }
  // Parked cars: in the lots, noses to the bays; a few at kerbs.
  for (const lot of city.lots) {
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i += 1) {
      const model = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
      const top = i % 2 === 0;
      const car = makeCar(model, lot.x + 30 + i * 36, top ? lot.y + 40 : lot.y + lot.h - 40, top ? Math.PI / 2 : -Math.PI / 2, model.paints[Math.floor(rng() * model.paints.length)], 'parked');
      car.driver = false;
      cars.push(car);
    }
  }
  for (let i = 0; i < 7; i += 1) {
    const model = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
    const avenue = [640, 1080, 1520, 1960, 2400, 2840, 3280][Math.floor(rng() * 7)];
    const car = makeCar(model, avenue + (rng() < 0.5 ? -57 : 57), 240 + rng() * (WORLD.height - 480), Math.PI / 2, model.paints[Math.floor(rng() * model.paints.length)], 'parked');
    car.driver = false;
    cars.push(car);
  }
  const garage = landmarkById('garage');
  const player = createPlayer(garage.x - 60, garage.y + 60);
  return { city, cars, peds: makePeds(rng, 44), player, rng };
}

// ---------------------------------------------------------------- game state
const seed = Number(new URLSearchParams(location.search).get('seed') ?? 7) || 7;
const world = buildWorld(seed);
const garage = landmarkById('garage');
const station = landmarkById('station');

const game = {
  mode: 'title',
  time: 0,
  hour: DAY_START_HOUR,
  city: world.city,
  cars: world.cars,
  peds: world.peds,
  player: world.player,
  rng: world.rng,
  liveRng: makeRng(1234567),
  police: createPolice(),
  job: null,
  storyIndex: 0,
  boardDone: 0,
  cash: 120,
  notices: [],
  brief: null,
  prompt: '',
  tracers: [],
  skids: [],
  pickups: [],
  particles,
  camera: { x: garage.x, y: garage.y },
  input,
  mouseWorld: { x: 0, y: 0 },
  audio: createAudio(),
  fx,
  hasSave: false,
  menuIndex: 0,
  bustFine: 0,
  light: daylight(DAY_START_HOUR),
  crimeCooldown: 0,
  saveTimer: 0,
  shotMode: false,
};
window.__cbh = game;

// ------------------------------------------------------------- game services
game.notify = (text) => {
  game.notices.push({ text, until: game.time + 4.2 });
  if (game.notices.length > 3) game.notices.shift();
  statusLine.textContent = text;
};
game.earn = (amount, message) => {
  game.cash += amount;
  game.audio.cash();
  if (message) game.notify(message);
};
game.dropCash = (x, y, amount) => {
  if (amount > 0) game.pickups.push({ x, y, amount, life: 26 });
};
/** Witness-based crime: somebody close has to see it for the stars to care. */
game.commitCrime = (level, x, y) => {
  let witnessed = false;
  for (const ped of game.peds) {
    if (ped.mode === 'down' || ped.mode === 'aboard') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < 215) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const cop of game.police.cruisers) {
      if (Math.hypot(cop.x - x, cop.y - y) < 360) { witnessed = true; break; }
    }
  }
  if (witnessed) reportCrime(game.police, level);
};
game.spawnFleeingDriver = (car) => {
  const ped = game.peds.find((p) => p.mode === 'walk');
  if (!ped) return;
  ped.x = car.x + 24;
  ped.y = car.y + 10;
  ped.mode = 'flee';
  ped.modeTime = 3;
  ped.fleeX = car.x;
  ped.fleeY = car.y;
};
game.nearestWaitingPed = (exclude = null) => {
  let best = null;
  let bestD = Infinity;
  for (const ped of game.peds) {
    if (ped.mode !== 'walk' || ped === exclude) continue;
    const d = Math.hypot(ped.x - game.player.x, ped.y - game.player.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
};
game.startJob = () => {
  game.job = game.storyIndex < STORY_COUNT ? STORY_JOBS[game.storyIndex](game) : makeBoardJob(game);
  game.brief = { title: game.job.title, lines: game.job.brief, until: game.time + 7.5 };
  game.audio.click();
};
function cleanupJobCars(keepPlayerCar = true) {
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car.jobOwned && !(keepPlayerCar && car === game.player.car)) game.cars.splice(i, 1);
    else if (car.jobOwned) car.jobOwned = false;
  }
}
function resolveJob(result) {
  const job = game.job;
  if (!job) return;
  if (result === 'done') {
    game.earn(job.pay, `${job.title} done — ${job.pay > 0 ? '+' : ''}$${job.pay}`);
    game.audio.fanfare();
    if (game.storyIndex < STORY_COUNT) {
      game.storyIndex += 1;
      if (game.storyIndex === STORY_COUNT) {
        game.notify('Story complete. The board at the garage is yours now');
      }
    } else {
      game.boardDone += 1;
    }
    game.job = null;
    cleanupJobCars(true);
    saveGame();
  } else {
    game.notify('Job blown. Marlin shrugs — the work will still be there');
    game.job = null;
    cleanupJobCars(false);
  }
}

// ---------------------------------------------------------------- saving
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash,
      storyIndex: game.storyIndex,
      boardDone: game.boardDone,
      hasPistol: game.player.hasPistol,
      px: Math.round(game.player.x),
      py: Math.round(game.player.y),
    }));
    game.hasSave = true;
  } catch { /* private mode etc: the game simply will not persist */ }
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function applySave(data) {
  game.cash = data.cash ?? 120;
  game.storyIndex = data.storyIndex ?? 0;
  game.boardDone = data.boardDone ?? 0;
  game.player.hasPistol = !!data.hasPistol;
  if (data.px) {
    game.player.x = data.px;
    game.player.y = data.py;
  }
}
game.hasSave = !!readSave();

// ---------------------------------------------------------------- menus
function startRun(fresh) {
  if (fresh) {
    game.cash = 120;
    game.storyIndex = 0;
    game.boardDone = 0;
    game.player.hasPistol = false;
    game.player.x = garage.x - 60;
    game.player.y = garage.y + 60;
    if (game.player.car) exitCar(game);
    clearWanted(game.police, game.cars);
    game.job = null;
    saveGame();
  } else {
    const data = readSave();
    if (data) applySave(data);
  }
  game.mode = 'play';
  game.audio.click();
}
function handleClick(mx, my) {
  if (game.mode === 'title') {
    const items = game.hasSave ? 2 : 1;
    for (let i = 0; i < items; i += 1) {
      const y = view.h * 0.52 + i * 46;
      if (mx > view.w / 2 - 130 && mx < view.w / 2 + 130 && my > y - 26 && my < y + 12) {
        game.menuIndex = i;
        activateTitle();
      }
    }
  } else if (game.mode === 'pause') {
    for (let i = 0; i < 3; i += 1) {
      const y = view.h * 0.48 + i * 42;
      if (mx > view.w / 2 - 140 && mx < view.w / 2 + 140 && my > y - 24 && my < y + 12) {
        game.menuIndex = i;
        activatePause();
      }
    }
  }
}
function activateTitle() {
  const items = game.hasSave ? ['continue', 'new'] : ['new'];
  startRun(items[game.menuIndex] === 'new');
}
function activatePause() {
  if (game.menuIndex === 0) game.mode = 'play';
  else if (game.menuIndex === 1) {
    // Restart the day: back at the garage, heat gone, work reset.
    if (game.player.car) exitCar(game);
    game.player.x = garage.x - 60;
    game.player.y = garage.y + 60;
    clearWanted(game.police, game.cars);
    game.job = null;
    cleanupJobCars(false);
    game.mode = 'play';
  } else {
    game.mode = 'title';
    game.menuIndex = 0;
    game.audio.engine(0, false);
    game.audio.siren(false);
  }
  game.audio.click();
}
function menuKeys(count, activate) {
  if (input.pressed('KeyW') || input.pressed('ArrowUp')) game.menuIndex = (game.menuIndex + count - 1) % count;
  if (input.pressed('KeyS') || input.pressed('ArrowDown')) game.menuIndex = (game.menuIndex + 1) % count;
  if (input.pressed('Enter')) activate();
}

// ---------------------------------------------------------------- bust flow
function doBust() {
  const fine = Math.min(game.cash, 120 + game.police.stars * 70);
  game.bustFine = fine;
  game.cash -= fine;
  game.mode = 'busted';
  game.audio.busted();
  game.audio.engine(0, false);
  game.audio.siren(false);
  statusLine.textContent = 'Busted by the CBPD';
}
function afterBust() {
  if (game.player.car) {
    const car = game.player.car;
    game.cars.splice(game.cars.indexOf(car), 1); // impounded
    game.player.car = null;
    game.player.lastCar = null;
  }
  if (game.job) {
    game.job = null;
    cleanupJobCars(false);
  }
  clearWanted(game.police, game.cars);
  game.player.x = station.x + 10;
  game.player.y = station.y + 55;
  game.mode = 'play';
  saveGame();
}

// ---------------------------------------------------------------- the frame
let lastStamp = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastStamp) / 1000);
  lastStamp = now;
  step(dt);
  draw();
  input.pressedSet.clear();
  requestAnimationFrame(frame);
}

function step(dt) {
  game.time += dt;
  game.light = daylight(game.hour);
  game.mouseWorld.x = game.camera.x + (input.mouseX - view.w / 2);
  game.mouseWorld.y = game.camera.y + (input.mouseY - view.h / 2);

  if (game.mode === 'title') {
    menuKeys(game.hasSave ? 2 : 1, activateTitle);
    idleWorld(dt);
    // A slow drift over the marina while the title hangs.
    game.camera.x = 905 + Math.sin(game.time * 0.05) * 130;
    game.camera.y = 1120 + Math.cos(game.time * 0.037) * 70;
    if (game.shotMode) { game.camera.x = 905; game.camera.y = 1120; }
    return;
  }
  if (game.mode === 'pause') {
    menuKeys(3, activatePause);
    return;
  }
  if (game.mode === 'busted') {
    if (input.pressed('Enter')) afterBust();
    return;
  }
  if (input.pressed('Escape')) {
    game.mode = 'pause';
    game.menuIndex = 0;
    game.audio.engine(0, false);
    return;
  }

  // The living city runs whether or not Mari is busy.
  game.hour = (game.hour + (dt / DAY_LENGTH_SECONDS) * 24) % 24;
  game.crimeCooldown = Math.max(0, game.crimeCooldown - dt);

  const foe = {
    x: game.player.x, y: game.player.y,
    angle: game.player.angle, speed: game.player.speed,
    onFoot: !game.player.car,
  };
  const busted = updatePolice(game.city, game.police, game.cars, foe, dt, game.liveRng);
  game.cars = game.cars.filter((c) => !c.retire);

  for (const car of game.cars) {
    if (car.kind === 'traffic' || car.kind === 'cab') {
      if (car !== game.player.car) updateTraffic(game.city, car, game.cars, dt, game.liveRng);
    }
    if (car.health < 42 && !car.wrecked && Math.random() < dt * 6) fx.smoke(car.x, car.y - 8, 1);
    if (car === game.player.car && Math.abs(car.speed) > 30 && Math.random() < dt * 5) {
      // Exhaust breathing out of the tailpipe as she pulls away.
      fx.smoke(car.x - Math.cos(car.angle) * car.model.length * 0.55, car.y - Math.sin(car.angle) * car.model.length * 0.55, 1);
    }
  }
  updatePeds(game.city, game.peds, dt, game.liveRng);

  // Player.
  if (game.player.car) updateDriving(game, dt);
  else {
    updateOnFoot(game, dt);
    game.audio.engine(0, false);
  }
  const crash = collideCars(game.cars, fx);
  if (crash && game.crimeCooldown <= 0) {
    const mine = crash.a === game.player.car || crash.b === game.player.car;
    const copInvolved = crash.a.kind === 'cruiser' || crash.b.kind === 'cruiser';
    if (mine && crash.rel > 120) {
      game.commitCrime(copInvolved ? 2 : 1, game.player.x, game.player.y);
      game.crimeCooldown = 1.4;
    }
  }
  carPedContact(dt);

  // Getting in and out of cars, and taking work from Marlin. One press, one
  // action, in the order the prompt on screen suggests.
  game.prompt = '';
  const atGarage = Math.hypot(game.player.x - garage.x, game.player.y - garage.y) < 64;
  if (input.pressed('KeyE')) {
    if (game.player.car) exitCar(game);
    else if (!game.job && atGarage) game.startJob();
    else {
      const car = carInReach(game.player, game.cars);
      if (car) enterCar(game, car);
    }
  }
  if (!game.player.car) {
    const car = carInReach(game.player, game.cars);
    if (car && (game.job || !atGarage)) game.prompt = `E — drive the ${car.model.name}`;
  }
  if (!game.job && atGarage && !game.player.car) {
    game.prompt = 'E — talk to Marlin (new job)';
  }

  // The job itself.
  const result = updateJob(game, dt);
  if (result) resolveJob(result);

  // Cash on the ground.
  for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
    const p = game.pickups[i];
    p.life -= dt;
    if (Math.hypot(p.x - game.player.x, p.y - game.player.y) < 24) {
      game.cash += p.amount;
      fx.text(p.x, p.y - 14, `+$${p.amount}`);
      game.audio.cash();
      game.pickups.splice(i, 1);
    } else if (p.life <= 0) game.pickups.splice(i, 1);
  }

  // Sirens you can hear are sirens that are close.
  const nearCop = game.police.cruisers.some((c) => Math.hypot(c.x - game.player.x, c.y - game.player.y) < 520);
  game.audio.siren(game.police.stars > 0 && nearCop);

  if (busted) {
    doBust();
    return;
  }

  // Camera: follow with a little lead in the direction of travel.
  const lead = game.player.car ? 0.38 : 0.12;
  const tx = game.player.x + Math.cos(game.player.angle) * game.player.speed * lead;
  const ty = game.player.y + Math.sin(game.player.angle) * game.player.speed * lead;
  const k = 1 - Math.exp(-dt * 4.2);
  game.camera.x = lerp(game.camera.x, clamp(tx, view.w / 2 - 200, WORLD.width - view.w / 2 + 200), k);
  game.camera.y = lerp(game.camera.y, clamp(ty, view.h / 2 - 160, WORLD.height - view.h / 2 + 160), k);

  // Skids fade; smoke clears; the game saves itself now and then.
  for (let i = game.skids.length - 1; i >= 0; i -= 1) {
    game.skids[i].life -= dt;
    if (game.skids[i].life <= 0) game.skids.splice(i, 1);
  }
  game.saveTimer += dt;
  if (game.saveTimer > 15) {
    game.saveTimer = 0;
    if (game.mode === 'play') saveGame();
  }
}

function idleWorld(dt) {
  // Behind menus the city still breathes: traffic rolls, people stroll.
  for (const car of game.cars) {
    if ((car.kind === 'traffic' || car.kind === 'cab') && car.driver) {
      updateTraffic(game.city, car, game.cars, dt, game.liveRng);
    }
  }
  updatePeds(game.city, game.peds, dt, game.liveRng);
}

function carPedContact() {
  for (const car of game.cars) {
    if (Math.abs(car.speed) < 55) continue;
    for (const ped of game.peds) {
      if (ped.mode === 'down' || ped.mode === 'aboard') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.model.width * 0.62 + 9) {
        knockDown(ped);
        scarePeds(game.peds, ped.x, ped.y, 170);
        if (car === game.player.car) game.commitCrime(2, ped.x, ped.y);
      }
    }
    // And the player herself can be clipped by traffic.
    if (!game.player.car && car !== game.player.car && Math.abs(car.speed) > 60) {
      if (Math.hypot(game.player.x - car.x, game.player.y - car.y) < car.model.width * 0.62 + 10) {
        const away = Math.atan2(game.player.y - car.y, game.player.x - car.x);
        game.player.x += Math.cos(away) * 30;
        game.player.y += Math.sin(away) * 30;
        game.notify('Clipped by traffic — watch the road!');
      }
    }
  }
}

// ---------------------------------------------------------------- drawing
function draw() {
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(view.w / 2 - game.camera.x, view.h / 2 - game.camera.y);

  drawWorld(ctx, game, view);
  drawSkids(ctx, game.skids);

  // Cash waiting on the pavement glints.
  for (const p of game.pickups) {
    const bob = Math.sin(game.time * 5 + p.x) * 2;
    ctx.fillStyle = '#8be28b';
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14401c';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', p.x, p.y + bob + 3);
  }

  if (game.mode === 'play' || game.mode === 'pause') drawMarker(ctx, game);

  for (const car of game.cars) drawCar(ctx, car, game.time);
  for (const ped of game.peds) {
    if (ped.mode !== 'aboard') drawPed(ctx, ped, game.time);
  }
  drawPlayer(ctx, game.player, game.time);

  // Tracers and particles.
  for (const t of game.tracers) {
    ctx.strokeStyle = `rgba(255, 230, 150, ${clamp(t.life / 0.07, 0, 1)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'text') {
      ctx.font = `800 ${p.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.4 : a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'smoke' ? p.size * (1.6 - a * 0.6) : p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Headlamps at night: soft cones ahead of every car.
  if (game.light.night > 0.25) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const car of game.cars) {
      const fx0 = car.x + Math.cos(car.angle) * car.model.length * 0.5;
      const fy0 = car.y + Math.sin(car.angle) * car.model.length * 0.5;
      const grad = ctx.createRadialGradient(fx0, fy0, 6, fx0, fy0, 150);
      grad.addColorStop(0, `rgba(255, 240, 190, ${0.16 * game.light.night})`);
      grad.addColorStop(1, 'rgba(255, 240, 190, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx0, fy0);
      const spread = 0.42;
      ctx.lineTo(fx0 + Math.cos(car.angle - spread) * 150, fy0 + Math.sin(car.angle - spread) * 150);
      ctx.lineTo(fx0 + Math.cos(car.angle + spread) * 150, fy0 + Math.sin(car.angle + spread) * 150);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // The hour's wash over everything.
  const L = game.light;
  ctx.fillStyle = `rgba(${L.r}, ${L.g}, ${L.b}, ${L.a})`;
  ctx.fillRect(game.camera.x - view.w / 2, game.camera.y - view.h / 2, view.w, view.h);
  ctx.restore();

  // Particle physics rides along at the end of the draw so smoke from this
  // frame's crashes is already placed; tracers burn out fast.
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= 1 / 60;
    p.x += p.vx * (1 / 60);
    p.y += p.vy * (1 / 60);
    if (p.kind === 'spark') { p.vx *= 0.92; p.vy *= 0.92; }
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = game.tracers.length - 1; i >= 0; i -= 1) {
    game.tracers[i].life -= 1 / 60;
    if (game.tracers[i].life <= 0) game.tracers.splice(i, 1);
  }

  if (game.mode === 'play') drawHud(ctx, game, view);
  else if (game.mode === 'title') drawTitle(ctx, game, view);
  else if (game.mode === 'pause') { drawHud(ctx, game, view); drawPause(ctx, game, view); }
  else if (game.mode === 'busted') drawBusted(ctx, game, view);
}

// ---------------------------------------------------------------- boot
const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) stageShot(game, shotName);
requestAnimationFrame(frame);

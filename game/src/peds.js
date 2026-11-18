// The people of Coral Bay: they stroll the pavements in the sun, run from
// trouble, wave for cabs, and — if the player is quick and nobody is watching
// — can be parted from their wallets. A ped walks the pavement line beside a
// road until a crossing, where it may turn; fear switches it to a sprint
// directly away from whatever scared it.

import { AVENUES_X, STREETS_Y, ROAD_HALF, WORLD, PED_PAINTS, PED_NAMES } from './config.js';
import { clamp } from './util.js';
import { collideBuildings } from './city.js';

const WALK_SPEED = 52;
const RUN_SPEED = 165;

export function makePeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng() < 0.55;
    const roadIndex = Math.floor(rng() * (vertical ? AVENUES_X.length : STREETS_Y.length));
    const side = rng() < 0.5 ? -1 : 1;
    const along = 160 + rng() * ((vertical ? WORLD.height : WORLD.width) - 320);
    const ped = {
      name: PED_NAMES[Math.floor(rng() * PED_NAMES.length)],
      paint: PED_PAINTS[Math.floor(rng() * PED_PAINTS.length)],
      vertical, roadIndex, side,
      dir: rng() < 0.5 ? 1 : -1,
      x: 0, y: 0,
      mode: 'walk', // walk | flee | down | hail
      modeTime: 0,
      fleeX: 0, fleeY: 0,
      phase: rng() * Math.PI * 2,
      wallet: 8 + Math.floor(rng() * 40),
    };
    placePed(ped, along);
    peds.push(ped);
  }
  return peds;
}

function placePed(ped, along) {
  const off = (ROAD_HALF + 8) * ped.side;
  if (ped.vertical) {
    ped.x = AVENUES_X[ped.roadIndex] + off;
    ped.y = along;
  } else {
    ped.x = along;
    ped.y = STREETS_Y[ped.roadIndex] + off;
  }
}

/** Scare every ped within radius of a point: gunfire, a crash, a chase. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.mode === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.mode = 'flee';
      ped.modeTime = 2.2 + Math.random() * 1.4;
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}

export function updatePeds(city, peds, dt, rng) {
  for (const ped of peds) {
    ped.phase += dt * (ped.mode === 'flee' ? 11 : 6);
    if (ped.mode === 'down') {
      ped.modeTime -= dt;
      if (ped.modeTime <= 0) {
        ped.mode = 'flee';
        ped.modeTime = 1.2;
        ped.fleeX = ped.x + (rng() - 0.5) * 10;
        ped.fleeY = ped.y + (rng() - 0.5) * 10;
      }
      continue;
    }
    if (ped.mode === 'flee') {
      ped.modeTime -= dt;
      const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.x += Math.cos(away) * RUN_SPEED * dt;
      ped.y += Math.sin(away) * RUN_SPEED * dt;
      const fixed = collideBuildings(city, ped.x, ped.y, 9);
      ped.x = fixed.x;
      ped.y = fixed.y;
      ped.x = clamp(ped.x, WORLD.waterEdge + 26, WORLD.width - 12);
      if (ped.modeTime <= 0) ped.mode = 'walk';
      continue;
    }
    if (ped.mode === 'hail') continue; // a fare, standing at the kerb waving

    // A stroll: follow the pavement, turn at crossings now and then.
    const speed = WALK_SPEED * ped.dir;
    if (ped.vertical) ped.y += speed * dt;
    else ped.x += speed * dt;
    const lines = ped.vertical ? STREETS_Y : AVENUES_X;
    const pos = ped.vertical ? ped.y : ped.x;
    for (const line of lines) {
      if (Math.abs(pos - line) < 4 && rng() < 0.012) {
        // Turn onto the crossing road's pavement.
        const off = (ROAD_HALF + 8) * ped.side;
        if (ped.vertical) {
          ped.vertical = false;
          ped.roadIndex = STREETS_Y.indexOf(line);
          ped.y = line + off;
        } else {
          ped.vertical = true;
          ped.roadIndex = AVENUES_X.indexOf(line);
          ped.x = line + off;
        }
        if (rng() < 0.4) ped.side = -ped.side;
        break;
      }
    }
    if (ped.x < WORLD.waterEdge + 30 || ped.x > WORLD.width - 14 || ped.y < 14 || ped.y > WORLD.height - 14) {
      ped.dir = -ped.dir;
      placePed(ped, clamp(ped.vertical ? ped.y : ped.x, 160, (ped.vertical ? WORLD.height : WORLD.width) - 160));
    }
  }
}

/** Knock a ped down (a car did it, usually). */
export function knockDown(ped) {
  ped.mode = 'down';
  ped.modeTime = 3.5;
}

export function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.mode === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(20,16,10,0.2)';
    ctx.fillRect(-10, 4, 20, 6);
    ctx.fillStyle = ped.paint;
    ctx.fillRect(-9, -3, 18, 6);
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(11, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.phase) * 1.6;
  ctx.fillStyle = 'rgba(20,16,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 5, 7, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs scissor, torso, head.
  ctx.strokeStyle = '#2d3142';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(ped.phase) * 4, 6);
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.sin(ped.phase) * 4, 6);
  ctx.stroke();
  ctx.fillStyle = ped.paint;
  ctx.beginPath();
  ctx.arc(0, bob - 2, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(0, bob - 8.5, 3.6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.mode === 'hail') {
    // A raised, waving arm and a hopeful marker.
    ctx.strokeStyle = ped.paint;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(3, bob - 4);
    ctx.lineTo(8 + Math.sin(time * 9) * 2, bob - 12);
    ctx.stroke();
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -18 + Math.sin(time * 5) * 2);
  }
  ctx.restore();
}

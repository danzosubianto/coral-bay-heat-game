// Mari Solano, the player's hands in Coral Bay: walking and sprinting the
// pavements, slipping into any car whose driver is absent or slow enough to
// argue with, and — once Marlin's second job pays out in hardware — shooting.
// Crimes are committed here but judged elsewhere: each one is reported
// through game.commitCrime, which decides whether anybody saw it.

import { WORLD } from './config.js';
import { clamp } from './util.js';
import { collideBuildings } from './city.js';
import { integrateCar } from './vehicles.js';
import { scarePeds, knockDown } from './peds.js';

const WALK = 175;
const SPRINT = 268;
export const PLAYER_RADIUS = 11;

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    speed: 0,
    car: null, // the car being driven, or null on foot
    hasPistol: false,
    walkPhase: 0,
    fireCooldown: 0,
    lastCar: null, // most recent ride, for the HUD and re-entry
  };
}

/** The car the player could get into right now, if any. */
export function carInReach(player, cars) {
  let best = null;
  let bestD = 52;
  for (const car of cars) {
    if (car.wrecked || car.kind === 'cruiser') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(game, car) {
  const { player } = game;
  if (car.driver) {
    // A moving jacking needs a near-stopped car; the driver bolts.
    if (Math.abs(car.speed) > 46) {
      game.notify('Too fast to jack — slow it down first');
      return false;
    }
    car.driver = false;
    game.spawnFleeingDriver(car);
    game.commitCrime(1, car.x, car.y);
    game.audio.door();
  } else if (car.kind !== 'parked' && car.parkedByPlayer !== true && car.stolenOnce !== true && !car.arranged) {
    game.commitCrime(1, car.x, car.y); // taking a stranger's car is still theft
    car.stolenOnce = true;
    game.audio.door();
  } else {
    game.audio.door();
  }
  car.wasKind = car.kind;
  if (car.kind === 'traffic') car.kind = 'player';
  player.car = car;
  player.lastCar = car;
  player.x = car.x;
  player.y = car.y;
  return true;
}

export function exitCar(game) {
  const { player } = game;
  const car = player.car;
  if (!car) return;
  car.parkedByPlayer = true;
  if (car.kind === 'player') car.kind = 'traffic';
  car.driver = false;
  car.speed = 0;
  // Step out on the left side of the car.
  const sideX = Math.cos(car.angle - Math.PI / 2);
  const sideY = Math.sin(car.angle - Math.PI / 2);
  player.x = car.x + sideX * (car.model.width / 2 + 14);
  player.y = car.y + sideY * (car.model.width / 2 + 14);
  const fixed = collideBuildings(game.city, player.x, player.y, PLAYER_RADIUS);
  player.x = fixed.x;
  player.y = fixed.y;
  player.car = null;
  game.audio.door();
}

/** On-foot update: movement, mugging, shooting. Driving lives in updateDriving. */
export function updateOnFoot(game, dt) {
  const { player, input, city } = game;
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);

  let mx = 0;
  let my = 0;
  if (input.down('KeyW') || input.down('ArrowUp')) my -= 1;
  if (input.down('KeyS') || input.down('ArrowDown')) my += 1;
  if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
  if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  const sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprinting ? SPRINT : WALK;
  if (moving) {
    const len = Math.hypot(mx, my);
    player.angle = Math.atan2(my, mx);
    player.x += (mx / len) * speed * dt;
    player.y += (my / len) * speed * dt;
    player.speed = speed;
    player.walkPhase += dt * (sprinting ? 11 : 8);
  } else {
    player.speed = 0;
  }
  const fixed = collideBuildings(city, player.x, player.y, PLAYER_RADIUS);
  player.x = fixed.x;
  player.y = fixed.y;
  player.x = clamp(player.x, WORLD.waterEdge + 16, WORLD.width - 12);

  // Mugging: F beside a pedestrian who is still upright.
  if (input.pressed('KeyF')) {
    for (const ped of game.peds) {
      if (ped.mode === 'down') continue;
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < 30) {
        game.dropCash(ped.x, ped.y, ped.wallet);
        ped.wallet = 0;
        ped.mode = 'flee';
        ped.modeTime = 2.6;
        ped.fleeX = player.x;
        ped.fleeY = player.y;
        game.commitCrime(1, player.x, player.y);
        game.notify('Mugged! Grab the cash before it fades');
        break;
      }
    }
  }

  // Shooting: the pistol points at the mouse; a click fires a tracer.
  if (player.hasPistol) {
    const aim = Math.atan2(game.mouseWorld.y - player.y, game.mouseWorld.x - player.x);
    player.aimAngle = aim;
    if (input.mouseDown && player.fireCooldown <= 0) {
      player.fireCooldown = 0.24;
      firePistol(game, aim);
    }
  }
}

function firePistol(game, angle) {
  const { player } = game;
  const range = 720;
  const x2 = player.x + Math.cos(angle) * range;
  const y2 = player.y + Math.sin(angle) * range;
  let hitX = x2;
  let hitY = y2;
  let victim = null;
  // Cars stop bullets; pedestrians, sadly, too.
  for (const car of game.cars) {
    const d = pointToSegment(car.x, car.y, player.x, player.y, x2, y2);
    if (d < car.model.width * 0.62) {
      const dist = Math.hypot(car.x - player.x, car.y - player.y);
      if (dist < Math.hypot(hitX - player.x, hitY - player.y)) {
        hitX = car.x;
        hitY = car.y;
        victim = { car };
      }
    }
  }
  for (const ped of game.peds) {
    if (ped.mode === 'down') continue;
    const d = pointToSegment(ped.x, ped.y, player.x, player.y, x2, y2);
    if (d < 10) {
      const dist = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (dist < Math.hypot(hitX - player.x, hitY - player.y)) {
        hitX = ped.x;
        hitY = ped.y;
        victim = { ped };
      }
    }
  }
  game.tracers.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 0.07 });
  game.fx.sparks(hitX, hitY, 3);
  game.audio.shot();
  scarePeds(game.peds, player.x, player.y, 300);
  if (victim?.car) {
    victim.car.health -= 16;
    if (victim.car.kind === 'cruiser') game.commitCrime(3, player.x, player.y);
    else game.commitCrime(2, player.x, player.y);
    if (victim.car.health <= 0 && !victim.car.wrecked) {
      victim.car.wrecked = true;
      game.fx.smoke(victim.car.x, victim.car.y, 8);
    }
  } else if (victim?.ped) {
    knockDown(victim.ped);
    game.commitCrime(3, player.x, player.y);
  } else {
    game.commitCrime(2, player.x, player.y);
  }
}

function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/** Driving update: keys become throttle and steering for the shared physics. */
export function updateDriving(game, dt) {
  const { player, input, city } = game;
  const car = player.car;
  if (!car) return;
  const drive = {
    throttle: 0,
    steer: 0,
    brake: input.down('Space'),
  };
  if (input.down('KeyW') || input.down('ArrowUp')) drive.throttle = 1;
  if (input.down('KeyS') || input.down('ArrowDown')) drive.throttle = -1;
  if (input.down('KeyA') || input.down('ArrowLeft')) drive.steer = -1;
  if (input.down('KeyD') || input.down('ArrowRight')) drive.steer = 1;
  integrateCar(city, car, drive, dt);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = Math.abs(car.speed);
  game.audio.engine(clamp(Math.abs(car.speed) / car.model.topSpeed, 0, 1), true);
}

/** Mari herself: coral tee, dark jeans, hair in a bun, a stride when she moves. */
export function drawPlayer(ctx, player, time) {
  if (player.car) return; // she is the car, for now
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(20,16,10,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 5, 7.5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const stride = player.speed > 4 ? Math.sin(player.walkPhase) * 4.4 : 0;
  const facing = player.hasPistol && player.aimAngle !== undefined ? player.aimAngle : player.angle;
  ctx.rotate(facing + Math.PI / 2);
  // Legs.
  ctx.strokeStyle = '#26324b';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(stride, 7);
  ctx.moveTo(0, 0);
  ctx.lineTo(-stride, 7);
  ctx.stroke();
  // Torso: the coral tee.
  ctx.fillStyle = '#ff6f61';
  ctx.beginPath();
  ctx.arc(0, -1, 6, 0, Math.PI * 2);
  ctx.fill();
  // Head and bun.
  ctx.fillStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.arc(0, -4.5, 4.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1c12';
  ctx.beginPath();
  ctx.arc(0, -8.6, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // The pistol, when she has one, points the way she aims.
  if (player.hasPistol) {
    ctx.fillStyle = '#15161a';
    ctx.fillRect(-1.2, -13, 2.4, 7);
  }
  ctx.restore();
  void time;
}

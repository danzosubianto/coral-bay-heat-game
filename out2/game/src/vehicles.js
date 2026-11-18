// Coral Bay's cars: how they are built, how they drive, and how the traffic
// among them finds its way around the grid. Player, police and rivals all run
// on the same arcade physics in integrateCar; traffic cars add a simple
// discipline on top — stay in the right-hand lane of the road you are on, and
// at each crossing choose to go straight or turn, then follow the new lane.

import { AVENUES_X, STREETS_Y, LANE_OFFSET, WORLD } from './config.js';
import { clamp, angleDelta, distanceSq } from './util.js';
import { collideBuildings } from './city.js';

// Effects sink (skids, sparks, smoke), wired up by main.js so this module
// never needs to know how effects are stored or drawn.
let fx = { skid() {}, sparks() {}, smoke() {}, crash() {} };
export function attachEffects(sink) {
  fx = sink;
}

let nextCarId = 1;

export function makeCar(model, x, y, angle, paint, kind = 'traffic') {
  return {
    id: nextCarId++,
    model, x, y, angle,
    speed: 0,
    steer: 0,
    paint: paint ?? model.paints[0],
    kind, // traffic | parked | cab | rival | cruiser | player
    health: 100,
    wrecked: false,
    driver: kind === 'traffic' || kind === 'cab',
    // Traffic routing: the road being followed and where it is heading.
    road: null, // { vertical: bool, index: number, dir: 1 | -1 }
    blockedFor: 0,
    honkAt: 0,
  };
}

/** The lane centre a car should sit on, given its road and heading. */
export function lanePoint(car) {
  const { vertical, index, dir } = car.road;
  if (vertical) {
    const cx = AVENUES_X[index];
    // Facing south (dir +1) the right-hand lane is the west one, and back.
    return { x: cx - dir * LANE_OFFSET, y: car.y };
  }
  const cy = STREETS_Y[index];
  return { x: car.x, y: cy + dir * LANE_OFFSET };
}

/** Put a traffic car on a road with a heading and a first target crossing. */
export function placeOnRoad(car, vertical, index, dir, along) {
  car.road = { vertical, index, dir };
  if (vertical) {
    car.x = AVENUES_X[index] - dir * LANE_OFFSET;
    car.y = along;
    car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = along;
    car.y = STREETS_Y[index] + dir * LANE_OFFSET;
    car.angle = dir > 0 ? 0 : Math.PI;
  }
}

/** The crossing a traffic car is currently driving toward. */
function targetCrossing(car) {
  const { vertical, index, dir } = car.road;
  if (vertical) {
    let si = dir > 0 ? STREETS_Y.length - 1 : 0;
    if (dir > 0) {
      for (let i = 0; i < STREETS_Y.length; i += 1) if (STREETS_Y[i] > car.y + 4) { si = i; break; }
    } else {
      for (let i = STREETS_Y.length - 1; i >= 0; i -= 1) if (STREETS_Y[i] < car.y - 4) { si = i; break; }
    }
    return { x: AVENUES_X[index] - dir * LANE_OFFSET, y: STREETS_Y[si], ai: index, si };
  }
  let ai = dir > 0 ? AVENUES_X.length - 1 : 0;
  if (dir > 0) {
    for (let i = 0; i < AVENUES_X.length; i += 1) if (AVENUES_X[i] > car.x + 4) { ai = i; break; }
  } else {
    for (let i = AVENUES_X.length - 1; i >= 0; i -= 1) if (AVENUES_X[i] < car.x - 4) { ai = i; break; }
  }
  return { x: AVENUES_X[ai], y: STREETS_Y[index] + dir * LANE_OFFSET, ai, si: index };
}

/** Choose what a traffic car does at the crossing it just reached. */
function chooseAtCrossing(car, crossing, rng) {
  const { vertical, index, dir } = car.road;
  const atEdge = vertical
    ? (dir > 0 && crossing.si === STREETS_Y.length - 1) || (dir < 0 && crossing.si === 0)
    : (dir > 0 && crossing.ai === AVENUES_X.length - 1) || (dir < 0 && crossing.ai === 0);
  const roll = rng();
  if (!atEdge && roll < 0.55) return; // straight on, same road
  // Turn: left or right relative to travel, unless the edge forces one way.
  const side = atEdge ? (roll < 0.5 ? 1 : -1) : roll < 0.775 ? 1 : -1;
  if (vertical) {
    // Turning east or west onto the crossing street. Facing south (+y),
    // left is east; facing north, left is west.
    const newDir = (dir > 0 ? side : -side) > 0 ? 1 : -1;
    car.road = { vertical: false, index: crossing.si, dir: newDir };
  } else {
    const newDir = (dir > 0 ? -side : side) > 0 ? 1 : -1;
    car.road = { vertical: true, index: crossing.ai, dir: newDir };
  }
  void index;
}

/**
 * Arcade car physics, shared by everyone. input: {throttle -1..1, steer -1..1,
 * brake bool}. Mutates the car; returns the impact speed of any crash this step.
 */
export function integrateCar(city, car, input, dt) {
  const m = car.model;
  if (car.wrecked) {
    car.speed = 0;
    return 0;
  }
  const target = input.throttle >= 0 ? m.topSpeed : -m.topSpeed * 0.42;
  const rate = input.throttle !== 0 ? m.accel : m.accel * 0.7;
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * 420 * dt;
    if (Math.abs(car.speed) < 12) car.speed = 0;
  } else if (car.speed < target) {
    car.speed = Math.min(target, car.speed + rate * dt);
  } else if (car.speed > target) {
    car.speed = Math.max(target, car.speed - rate * dt);
  }
  // Rolling drag so a lifted throttle settles the car.
  car.speed -= car.speed * 0.25 * dt;

  const speedRatio = clamp(Math.abs(car.speed) / m.topSpeed, 0, 1);
  const steerPower = m.grip * (0.35 + 0.65 * (1 - speedRatio * 0.45));
  car.angle += input.steer * steerPower * dt * clamp(car.speed / 120, -1, 1);
  car.steer = input.steer;

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;

  // Skid marks when the rear steps out: hard steering or handbrake at speed.
  const drifting = input.brake && Math.abs(car.speed) > 130;
  if ((Math.abs(input.steer) > 0.85 && Math.abs(car.speed) > 210) || drifting) {
    const back = m.length * 0.36;
    const side = m.width * 0.36;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    fx.skid(car.x - cos * back - sin * side, car.y - sin * back + cos * side);
    fx.skid(car.x - cos * back + sin * side, car.y - sin * back - cos * side);
  }

  // Buildings are unforgiving.
  const before = Math.abs(car.speed);
  const hit = collideBuildings(city, car.x, car.y, m.width * 0.62);
  if (hit.pushed) {
    car.x = hit.x;
    car.y = hit.y;
    if (before > 60) {
      const impact = before;
      car.health -= impact * 0.055;
      car.speed = -car.speed * 0.22;
      fx.sparks(car.x, car.y, Math.min(14, 4 + impact / 30));
      fx.crash(Math.min(1, impact / 320));
      if (car.health <= 0) {
        car.health = 0;
        car.wrecked = true;
        fx.smoke(car.x, car.y, 10);
      }
      return impact;
    }
    car.speed *= 0.6;
  }
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
  return 0;
}

/** One traffic car's think-and-drive step. */
export function updateTraffic(city, car, others, dt, rng) {
  if (car.wrecked || !car.driver || !car.road) return;
  const crossing = targetCrossing(car);
  const lane = lanePoint(car);
  // Aim at a point a little ahead on the lane line through the crossing.
  const aimX = car.road.vertical ? lane.x : crossing.x;
  const aimY = car.road.vertical ? crossing.y : lane.y;
  const want = Math.atan2(aimY - car.y, aimX - car.x);
  const steer = clamp(angleDelta(car.angle, want) * 2.6, -1, 1);

  // Keep off the car in front: project every neighbour onto this car's
  // heading — only what is truly ahead and truly in this lane counts, so a
  // car parked on the pavement never stops the traffic rolling past it.
  let throttle = 0.82;
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of others) {
    if (other === car) continue;
    const rx = other.x - car.x;
    const ry = other.y - car.y;
    const forward = rx * hx + ry * hy;
    if (forward < 6 || forward > 84) continue;
    const lateral = Math.abs(rx * -hy + ry * hx);
    if (lateral < 27) {
      throttle = other.speed > car.speed + 8 ? 0.25 : 0;
      break;
    }
  }
  if (throttle === 0) car.blockedFor += dt;
  else car.blockedFor = 0;
  if (car.blockedFor > 5) {
    // Gridlock mercy: edge forward like a real driver until the way clears,
    // instead of sitting in a frozen queue forever.
    throttle = 0.35;
  }
  integrateCar(city, car, { throttle, steer, brake: throttle === 0 && car.speed > 4 }, dt);

  const near = Math.hypot(crossing.x - car.x, crossing.y - car.y) < 26;
  if (near && !car.turnedAt) {
    car.turnedAt = `${crossing.ai},${crossing.si}`;
    chooseAtCrossing(car, crossing, rng);
  } else if (!near) {
    car.turnedAt = null;
  }
}

/** Car-to-car bumps: separate overlapping cars and share the damage. */
export function collideCars(cars, effects) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const minD = (a.model.width + b.model.width) * 0.72;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
      if (rel > 55) {
        const dmg = rel * 0.05;
        a.health -= dmg;
        b.health -= dmg;
        effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 8);
        effects.crash(Math.min(1, rel / 300));
        if (a.health <= 0) { a.health = 0; a.wrecked = true; }
        if (b.health <= 0) { b.health = 0; b.wrecked = true; }
        a.speed *= 0.55;
        b.speed *= 0.55;
        return { a, b, rel };
      }
      const swap = (a.speed + b.speed) / 2;
      a.speed = swap * 0.9;
      b.speed = swap * 0.9;
    }
  }
  return null;
}

/** Draw one car: body, roof, glass, wheels, and its working clothes. */
export function drawCar(ctx, car, time) {
  const m = car.model;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = m.length;
  const W = m.width;
  // Soft shadow.
  ctx.fillStyle = 'rgba(20, 16, 10, 0.25)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 5, L, W);
  // Wheels.
  ctx.fillStyle = '#17181c';
  const ww = 9;
  ctx.fillRect(-L * 0.32 - ww / 2, -W / 2 - 2, ww, 6);
  ctx.fillRect(-L * 0.32 - ww / 2, W / 2 - 4, ww, 6);
  ctx.fillRect(L * 0.30 - ww / 2, -W / 2 - 2, ww, 6);
  ctx.fillRect(L * 0.30 - ww / 2, W / 2 - 4, ww, 6);
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3e' : car.paint;
  roundRect(ctx, -L / 2, -W / 2, L, W, 8);
  ctx.fill();
  if (car.kind === 'cruiser') {
    ctx.fillStyle = '#e8ecf1';
    ctx.fillRect(-L * 0.08, -W / 2, L * 0.3, W);
  }
  if (car.kind === 'cab') {
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  // Cabin and glass.
  ctx.fillStyle = 'rgba(18, 26, 38, 0.88)';
  roundRect(ctx, -L * 0.16, -W * 0.36, L * 0.36, W * 0.72, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 190, 220, 0.5)';
  ctx.fillRect(L * 0.13, -W * 0.33, L * 0.06, W * 0.66);
  // Roof.
  ctx.fillStyle = car.wrecked ? '#2c2c30' : car.paint;
  roundRect(ctx, -L * 0.13, -W * 0.30, L * 0.24, W * 0.6, 4);
  ctx.fill();
  // Lights: pale lamps front, red rear.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 3, -W * 0.34, 3, 6);
  ctx.fillRect(L / 2 - 3, W * 0.34 - 6, 3, 6);
  ctx.fillStyle = '#d23b3b';
  ctx.fillRect(-L / 2, -W * 0.34, 3, 6);
  ctx.fillRect(-L / 2, W * 0.34 - 6, 3, 6);
  if (car.kind === 'cruiser') {
    const phase = Math.floor(time * 5) % 2 === 0;
    ctx.fillStyle = phase ? '#ff4040' : '#4060ff';
    ctx.fillRect(-6, -W * 0.3, 12, 6);
    ctx.fillStyle = phase ? '#4060ff' : '#ff4040';
    ctx.fillRect(-6, W * 0.3 - 6, 12, 6);
  }
  if (car.kind === 'cab') {
    ctx.fillStyle = '#fff2a8';
    ctx.fillRect(-5, -5, 10, 10);
  }
  // Damage scorch.
  if (car.health < 55) {
    ctx.fillStyle = `rgba(15, 12, 10, ${(55 - car.health) / 90})`;
    roundRect(ctx, -L / 2, -W / 2, L * 0.5, W, 8);
    ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

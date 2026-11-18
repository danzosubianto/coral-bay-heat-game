// The Coral Bay Police Department. Wanted works on witnesses: a crime only
// raises stars when somebody sees it — a pedestrian close enough to tell the
// tale, or a cruiser already on the street. Once wanted, cruisers hunt: they
// steer for where the player is heading, ram and box in, and at four stars
// they park across the road ahead. Stay unseen and the heat cools, one star
// at a time. Get pinned — on foot with a cruiser on top of you, or in a car
// that can no longer move — and the bust meter fills.

import { CAR_MODELS, AVENUES_X, STREETS_Y } from './config.js';
import { clamp, angleDelta } from './util.js';
import { nearestCrossing } from './city.js';
import { makeCar, placeOnRoad, integrateCar } from './vehicles.js';

const CRUISER = CAR_MODELS.find((m) => m.id === 'cruiser');
const WANTED_CRUISERS = [0, 1, 2, 3, 4, 6]; // index by stars

export function createPolice() {
  return {
    stars: 0,
    hideTime: 0, // seconds since a cruiser last had eyes on the player
    bust: 0, // 0..1; full means busted
    cruisers: [],
    blockCooldown: 0,
  };
}

/** A witnessed crime. level is the star count it earns on its own. */
export function reportCrime(police, level) {
  police.stars = Math.max(police.stars, clamp(level, 1, 5));
  police.hideTime = 0;
}

/** Did any cruiser have eyes on the player this frame? */
export function policeSees(police, px, py) {
  for (const c of police.cruisers) {
    if (Math.hypot(c.x - px, c.y - py) < 470) return true;
  }
  return false;
}

function spawnCruiser(city, police, cars, px, py, rng) {
  // Come from a crossing well out of sight, so the hunt feels fair.
  for (let tries = 0; tries < 12; tries += 1) {
    const ai = Math.floor(rng() * 7);
    const si = Math.floor(rng() * 6);
    const x = AVENUES_X[ai];
    const y = STREETS_Y[si];
    const d = Math.hypot(x - px, y - py);
    if (d < 540 || d > 980) continue;
    const cruiser = makeCar(CRUISER, x, y, 0, CRUISER.paints[0], 'cruiser');
    cruiser.driver = true;
    const vertical = rng() < 0.5;
    placeOnRoad(cruiser, vertical, vertical ? ai : si, rng() < 0.5 ? 1 : -1, vertical ? y : x);
    cruiser.x = x;
    cruiser.y = y;
    police.cruisers.push(cruiser);
    cars.push(cruiser);
    return cruiser;
  }
  return null;
}

function setRoadblock(city, police, cars, player, rng) {
  // Park two cruisers across the road the player is running toward.
  const aheadX = player.x + Math.cos(player.angle ?? 0) * 520;
  const aheadY = player.y + Math.sin(player.angle ?? 0) * 520;
  const near = nearestCrossing(aheadX, aheadY);
  const cx = AVENUES_X[near.ai];
  const cy = STREETS_Y[near.si];
  for (let i = 0; i < 2; i += 1) {
    const cruiser = makeCar(CRUISER, cx + (i === 0 ? -26 : 26), cy + (i === 0 ? 10 : -10), Math.PI / 2 + (i ? 0.22 : -0.22), CRUISER.paints[0], 'cruiser');
    cruiser.roadblock = true;
    cruiser.driver = false;
    police.cruisers.push(cruiser);
    cars.push(cruiser);
  }
  police.blockCooldown = 26;
}

/** Is the straight drive from A to B walled off by a building? */
function segmentBlocked(city, x1, y1, x2, y2) {
  const steps = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 42));
  for (let i = 1; i < steps; i += 1) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    for (const b of city.buildings) {
      if (x > b.x - 16 && x < b.x + b.w + 16 && y > b.y - 16 && y < b.y + b.h + 16) return true;
    }
  }
  return false;
}

/**
 * Advance the whole police response. `foe` is whoever is being hunted:
 * {x, y, angle, speed, onFoot}. Returns true the moment the bust lands.
 */
export function updatePolice(city, police, cars, foe, dt, rng) {
  const seen = policeSees(police, foe.x, foe.y);
  if (seen) police.hideTime = 0;
  else police.hideTime += dt;
  if (police.stars > 0 && police.hideTime > 7) {
    police.stars -= 1;
    police.hideTime = 2.5; // remaining stars cool more slowly
  }

  // Keep the fleet at the size the stars call for.
  const hunting = police.cruisers.filter((c) => !c.roadblock);
  const wanted = WANTED_CRUISERS[police.stars];
  if (hunting.length < wanted) spawnCruiser(city, police, cars, foe.x, foe.y, rng);
  for (const c of [...police.cruisers]) {
    const d = Math.hypot(c.x - foe.x, c.y - foe.y);
    if ((police.stars === 0 && d > 300) || d > 1500 || c.wrecked) {
      c.retire = true;
      police.cruisers.splice(police.cruisers.indexOf(c), 1);
    }
  }

  police.blockCooldown -= dt;
  if (police.stars >= 4 && police.blockCooldown <= 0) {
    const blocks = police.cruisers.filter((c) => c.roadblock);
    if (blocks.length < 2) setRoadblock(city, police, cars, foe, rng);
  }

  // The hunt itself.
  let nearest = Infinity;
  police.cruisers.forEach((cruiser, i) => {
    if (cruiser.roadblock || cruiser.wrecked) return;
    const lead = 0.45;
    let tx = foe.x + Math.cos(foe.angle ?? 0) * (foe.speed ?? 0) * lead + (i % 2 ? 26 : -26);
    let ty = foe.y + Math.sin(foe.angle ?? 0) * (foe.speed ?? 0) * lead + (i % 3 === 0 ? 20 : -14);
    const dist = Math.hypot(foe.x - cruiser.x, foe.y - cruiser.y);
    // Buildings are not a suggestion to a determined officer, but they are
    // solid: when the straight line is walled off, route via the crossing
    // nearest the foe and come down their street instead.
    if (dist > 240 && segmentBlocked(city, cruiser.x, cruiser.y, foe.x, foe.y)) {
      const near = nearestCrossing(foe.x, foe.y);
      tx = AVENUES_X[near.ai];
      ty = STREETS_Y[near.si];
    }
    // Stuck on a wall too long? Radio in a re-route: rejoin at the nearest
    // crossing and come again. The hunt should never die against a building.
    if (Math.abs(cruiser.speed) < 14 && dist > 200) {
      cruiser.stuckT = (cruiser.stuckT ?? 0) + dt;
      if (cruiser.stuckT > 2.5) {
        const near = nearestCrossing(cruiser.x, cruiser.y);
        cruiser.x = AVENUES_X[near.ai];
        cruiser.y = STREETS_Y[near.si];
        cruiser.speed = 120;
        cruiser.stuckT = 0;
      }
    } else {
      cruiser.stuckT = 0;
    }
    const want = Math.atan2(ty - cruiser.y, tx - cruiser.x);
    const steer = clamp(angleDelta(cruiser.angle, want) * 2.4, -1, 1);
    nearest = Math.min(nearest, dist);
    const throttle = dist > 26 ? 1 : 0.2;
    integrateCar(city, cruiser, { throttle, steer, brake: false }, dt);
  });

  // The bust: pinned and close means caught.
  const pinned = foe.onFoot ? nearest < 120 : Math.abs(foe.speed ?? 0) < 26 && nearest < 115;
  if (police.stars > 0 && pinned) police.bust = Math.min(1, police.bust + dt / 2.6);
  else police.bust = Math.max(0, police.bust - dt / 1.1);
  return police.bust >= 1;
}

/** After a bust: the slate is wiped, the fleet stands down. */
export function clearWanted(police, cars) {
  police.stars = 0;
  police.bust = 0;
  police.hideTime = 0;
  for (const c of police.cruisers) c.retire = true;
  police.cruisers.length = 0;
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    if (cars[i].retire) cars.splice(i, 1);
  }
}

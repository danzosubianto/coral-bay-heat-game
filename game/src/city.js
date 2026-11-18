// Builds Coral Bay from config.js's grid: the blocks between the roads become
// buildings, car parks and palm parks; a handful of blocks are the named
// landmarks the story runs between. Everything is placed from a seeded RNG,
// so the city is identical on every load. Also answers the questions every
// other system asks: is this point on a road, what does this circle hit,
// where is a good place to stand, park or spawn.

import {
  AVENUES_X, STREETS_Y, ROAD_HALF, SIDEWALK, WORLD,
  BUILDING_PAINTS, ROOF_PAINTS, AVENUE_NAMES, STREET_NAMES,
} from './config.js';
import { makeRng, clamp, circleHitsRect, pushCircleOutOfRect } from './util.js';

// Named places the jobs run between. x/y is the street-side marker a player
// drives or walks into; the building itself sits in the block behind it.
export const LANDMARKS = [
  { id: 'garage', name: 'Doss Auto & Salvage', short: "Marlin's garage", x: 1150, y: 1985 },
  { id: 'marina', name: 'Coral Bay Marina', short: 'the marina', x: 585, y: 1120 },
  { id: 'diner', name: 'The Salty Gull', short: 'the Salty Gull', x: 1230, y: 790 },
  { id: 'cabdepot', name: 'Sunfare Cabs', short: 'the cab depot', x: 2905, y: 390 },
  { id: 'hotel', name: 'Coral Crown Hotel', short: 'the Coral Crown', x: 2470, y: 1450 },
  { id: 'station', name: 'CBPD Station', short: 'the CBPD station', x: 2025, y: 965 },
  { id: 'mall', name: 'Palms Mall', short: 'Palms Mall', x: 2905, y: 1590 },
  { id: 'vipers', name: "Vipers' Den", short: "the Vipers' den", x: 2905, y: 1985 },
];

export function landmarkById(id) {
  return LANDMARKS.find((l) => l.id === id);
}

export function buildCity(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const buildings = [];
  const parks = [];
  const lots = [];
  const palms = [];

  // Blocks are the cells between neighbouring avenues and streets.
  for (let xi = 0; xi < AVENUES_X.length - 1; xi += 1) {
    for (let yi = 0; yi < STREETS_Y.length - 1; yi += 1) {
      const x0 = AVENUES_X[xi] + ROAD_HALF + SIDEWALK + 6;
      const x1 = AVENUES_X[xi + 1] - ROAD_HALF - SIDEWALK - 6;
      const y0 = STREETS_Y[yi] + ROAD_HALF + SIDEWALK + 6;
      const y1 = STREETS_Y[yi + 1] - ROAD_HALF - SIDEWALK - 6;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 150 || h < 150) continue;
      const roll = rng();
      if (roll < 0.14) {
        // A palm park: grass, palms, no walls.
        parks.push({ x: x0, y: y0, w, h });
        const count = 4 + Math.floor(rng() * 5);
        for (let i = 0; i < count; i += 1) {
          palms.push({ x: x0 + 20 + rng() * (w - 40), y: y0 + 20 + rng() * (h - 40), lean: rng() * 0.5 - 0.25 });
        }
        continue;
      }
      if (roll < 0.26) {
        // An open car park: asphalt, marked bays, parked cars live here.
        lots.push({ x: x0, y: y0, w, h });
        continue;
      }
      // One or two buildings fill the block, with a lane of breathing room.
      const two = w > 300 && rng() < 0.6;
      const cuts = two ? 2 : 1;
      for (let c = 0; c < cuts; c += 1) {
        const bx = x0 + (w / cuts) * c + 8;
        const bw = w / cuts - 16;
        const bh = h * (0.62 + rng() * 0.3);
        const by = y0 + (h - bh) * rng();
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          paint: BUILDING_PAINTS[Math.floor(rng() * BUILDING_PAINTS.length)],
          roof: ROOF_PAINTS[Math.floor(rng() * ROOF_PAINTS.length)],
          floors: 2 + Math.floor(rng() * 6),
          seed: Math.floor(rng() * 1e9),
        });
      }
      // A palm or two on the block's corners, city dressing.
      if (rng() < 0.7) palms.push({ x: x0 + 8, y: y0 + 8, lean: rng() * 0.4 - 0.2 });
      if (rng() < 0.5) palms.push({ x: x1 - 8, y: y1 - 8, lean: rng() * 0.4 - 0.2 });
    }
  }

  // Beach palms along the sand, and the marina pier reaching into the bay.
  for (let y = 180; y < WORLD.height - 120; y += 130 + rng() * 90) {
    palms.push({ x: 480 + rng() * 50, y, lean: rng() * 0.6 - 0.3 });
  }
  const pier = { x: 210, y: 1092, w: 250, h: 56 };

  return { buildings, parks, lots, palms, pier, rng };
}

/** Every solid rectangle a body can bump into: buildings and the pier. */
export function solidRects(city) {
  return [...city.buildings, city.pier];
}

/** True when the point lies on asphalt (a road strip, either direction). */
export function onRoad(x, y) {
  for (const ax of AVENUES_X) if (Math.abs(x - ax) <= ROAD_HALF) return true;
  for (const sy of STREETS_Y) if (Math.abs(y - sy) <= ROAD_HALF) return true;
  return false;
}

/** True when the point is on a pavement beside a road (not in the road). */
export function onSidewalk(x, y) {
  const edge = ROAD_HALF + SIDEWALK;
  for (const ax of AVENUES_X) {
    const d = Math.abs(x - ax);
    if (d > ROAD_HALF && d <= edge) return true;
  }
  for (const sy of STREETS_Y) {
    const d = Math.abs(y - sy);
    if (d > ROAD_HALF && d <= edge) return true;
  }
  return false;
}

/** Collide a circle against every building; returns corrected position. */
export function collideBuildings(city, x, y, radius) {
  let out = { x, y, pushed: false };
  for (const rect of solidRects(city)) {
    if (circleHitsRect(out.x, out.y, radius, rect)) {
      out = pushCircleOutOfRect(out.x, out.y, radius, rect);
    }
  }
  out.x = clamp(out.x, radius, WORLD.width - radius);
  out.y = clamp(out.y, radius, WORLD.height - radius);
  return out;
}

/** The intersection (avenue index, street index) nearest a point. */
export function nearestCrossing(x, y) {
  let best = { ai: 0, si: 0, d: Infinity };
  for (let ai = 0; ai < AVENUES_X.length; ai += 1) {
    for (let si = 0; si < STREETS_Y.length; si += 1) {
      const d = Math.hypot(AVENUES_X[ai] - x, STREETS_Y[si] - y);
      if (d < best.d) best = { ai, si, d };
    }
  }
  return best;
}

/** A random point in a random traffic lane, for spawning the city's cars. */
export function randomLanePoint(rng) {
  if (rng() < 0.5) {
    const ai = Math.floor(rng() * AVENUES_X.length);
    return { x: AVENUES_X[ai], y: 200 + rng() * (WORLD.height - 400), vertical: true, index: ai };
  }
  const si = Math.floor(rng() * STREETS_Y.length);
  return { x: 700 + rng() * (WORLD.width - 900), y: STREETS_Y[si], vertical: false, index: si };
}

/** Street name for flavour text: the nearest crossing, "Doss Ave & Gull St". */
export function crossingName(x, y) {
  const c = nearestCrossing(x, y);
  return `${AVENUE_NAMES[c.ai]} & ${STREET_NAMES[c.si]}`;
}

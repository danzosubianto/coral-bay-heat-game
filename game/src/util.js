// Small shared helpers for Coral Bay Heat: a seeded random generator (so the
// city is the same city on every visit and in every screenshot), plain math
// helpers, and the two collision tests the whole game leans on.

/** A mulberry32 generator: tiny, fast, and identical from seed to seed. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle `from` to angle `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `angle` toward `target` by at most `maxStep`. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Circle against axis-aligned rectangle: true when they touch or overlap. */
export function circleHitsRect(cx, cy, radius, rect) {
  const nearX = clamp(cx, rect.x, rect.x + rect.w);
  const nearY = clamp(cy, rect.y, rect.y + rect.h);
  return distanceSq(cx, cy, nearX, nearY) < radius * radius;
}

/**
 * Push a circle out of a rectangle along the shallowest axis.
 * Returns the corrected {x, y} and whether a push happened.
 */
export function pushCircleOutOfRect(cx, cy, radius, rect) {
  const nearX = clamp(cx, rect.x, rect.x + rect.w);
  const nearY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearX;
  const dy = cy - nearY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return { x: cx, y: cy, pushed: false };
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nearX + (dx / d) * radius, y: nearY + (dy / d) * radius, pushed: true };
  }
  // Centre is inside the rectangle: leave by the nearest face.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: rect.x - radius, y: cy, pushed: true };
  if (min === right) return { x: rect.x + rect.w + radius, y: cy, pushed: true };
  if (min === top) return { x: cx, y: rect.y - radius, pushed: true };
  return { x: cx, y: rect.y + rect.h + radius, pushed: true };
}

/** Format a whole-dollar amount the way the HUD shows it: $1,250. */
export function money(amount) {
  return '$' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** mm:ss for mission clocks. */
export function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** The day's hour (0..24) the way a person says it: 9:30 AM, 6:42 PM. */
export function hourText(hour) {
  const h24 = Math.floor(hour) % 24;
  const mins = Math.floor((hour - Math.floor(hour)) * 60);
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins.toString().padStart(2, '0')} ${suffix}`;
}

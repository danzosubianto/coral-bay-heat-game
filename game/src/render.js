// Painting Coral Bay: the animated bay and its beach, the road grid with its
// markings, the pastel blocks with their shadows and lit windows, palms,
// parks and the pier — and over everything, the light of the hour, from
// mid-morning glare through a coral dusk to a blue night in which the
// windows and headlamps come on. Entities (cars, people) are drawn by their
// own modules between this ground and the light.

import { WORLD, AVENUES_X, STREETS_Y, ROAD_HALF, SIDEWALK } from './config.js';
import { makeRng } from './util.js';
import { LANDMARKS } from './city.js';

/** Overlay colour and darkness for an hour of the day (0..24). */
export function daylight(hour) {
  // Returns {r, g, b, a, night} — a wash laid over the world.
  const stops = [
    { h: 0, r: 16, g: 24, b: 58, a: 0.42, night: 1 },
    { h: 5, r: 16, g: 24, b: 58, a: 0.42, night: 1 },
    { h: 6.5, r: 64, g: 44, b: 60, a: 0.22, night: 0.5 },
    { h: 8, r: 255, g: 190, b: 120, a: 0.07, night: 0 },
    { h: 16.5, r: 255, g: 214, b: 140, a: 0.05, night: 0 },
    { h: 18.5, r: 255, g: 130, b: 80, a: 0.16, night: 0.15 },
    { h: 20, r: 90, g: 50, b: 90, a: 0.3, night: 0.65 },
    { h: 21.5, r: 16, g: 24, b: 58, a: 0.42, night: 1 },
    { h: 24, r: 16, g: 24, b: 58, a: 0.42, night: 1 },
  ];
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].h <= hour) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const t = (hour - a.h) / Math.max(0.001, b.h - a.h);
  const mix = (x, y) => x + (y - x) * t;
  return {
    r: Math.round(mix(a.r, b.r)),
    g: Math.round(mix(a.g, b.g)),
    b: Math.round(mix(a.b, b.b)),
    a: mix(a.a, b.a),
    night: mix(a.night, b.night),
  };
}

export function drawWorld(ctx, game, view) {
  const { city, time } = game;
  const cam = game.camera;
  const x0 = cam.x - view.w / 2 - 60;
  const y0 = cam.y - view.h / 2 - 60;
  const x1 = cam.x + view.w / 2 + 60;
  const y1 = cam.y + view.h / 2 + 60;

  // The bay: deep blue out at the horizon line, paling toward the shore,
  // with slow wave glints drifting across it.
  const sea = ctx.createLinearGradient(x0, 0, WORLD.waterEdge, 0);
  sea.addColorStop(0, '#1d6186');
  sea.addColorStop(0.75, '#2b7ea6');
  sea.addColorStop(1, '#3f97b8');
  ctx.fillStyle = sea;
  ctx.fillRect(x0, y0, WORLD.waterEdge - x0 + 4, y1 - y0);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 26; row += 1) {
    const wy = y0 + row * 110 + Math.sin(time * 0.7 + row * 1.7) * 6;
    ctx.beginPath();
    for (let wx = x0; wx < WORLD.waterEdge; wx += 46) {
      const yy = wy + Math.sin(wx * 0.02 + time * 1.3 + row) * 3;
      if (wx === x0) ctx.moveTo(wx, yy);
      else ctx.lineTo(wx, yy);
    }
    ctx.stroke();
  }
  // Foam worrying at the shoreline, always on the move.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let fy = y0; fy < y1; fy += 26) {
    const fx = WORLD.waterEdge - 3 + Math.sin(fy * 0.05 + time * 1.6) * 4;
    if (fy === y0) ctx.moveTo(fx, fy);
    else ctx.lineTo(fx, fy);
  }
  ctx.stroke();
  // The pier.
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let px = city.pier.x + 14; px < city.pier.x + city.pier.w; px += 28) {
    ctx.fillRect(px, city.pier.y, 3, city.pier.h);
  }
  for (const boat of city.boats) drawBoat(ctx, boat, time);

  // Sand, its boardwalk, then the city's pale ground.
  ctx.fillStyle = '#eed9a4';
  ctx.fillRect(WORLD.waterEdge, y0, WORLD.beachEdge - WORLD.waterEdge, y1 - y0);
  ctx.fillStyle = '#c8a878';
  ctx.fillRect(WORLD.beachEdge - 26, y0, 26, y1 - y0);
  ctx.fillStyle = 'rgba(90, 64, 36, 0.35)';
  for (let by = Math.floor(y0 / 18) * 18; by < y1; by += 18) {
    ctx.fillRect(WORLD.beachEdge - 26, by, 26, 2);
  }
  for (const umb of city.umbrellas) {
    if (umb.y < y0 - 20 || umb.y > y1 + 20) continue;
    drawUmbrella(ctx, umb);
  }
  ctx.fillStyle = '#c9bb9c';
  ctx.fillRect(WORLD.beachEdge, y0, x1 - WORLD.beachEdge, y1 - y0);

  // Parks: green insets with a sandy path cross and benches under the palms.
  for (const park of city.parks) {
    if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
    ctx.fillStyle = '#79a95c';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.strokeStyle = 'rgba(46, 84, 38, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(park.x + 2, park.y + 2, park.w - 4, park.h - 4);
    ctx.fillStyle = '#d9c48f';
    ctx.fillRect(park.x, park.y + park.h / 2 - 7, park.w, 14);
    ctx.fillRect(park.x + park.w / 2 - 7, park.y, 14, park.h);
    ctx.fillStyle = '#7a5c3e';
    const benches = 2 + Math.floor((park.x + park.y) % 3);
    for (let i = 0; i < benches; i += 1) {
      const bx = park.x + 22 + ((i * 97) % Math.max(30, park.w - 60));
      const by = park.y + park.h / 2 + (i % 2 ? 14 : -22);
      ctx.fillRect(bx, by, 20, 5);
    }
  }
  // Car parks: asphalt with bay lines.
  for (const lot of city.lots) {
    if (lot.x > x1 || lot.x + lot.w < x0 || lot.y > y1 || lot.y + lot.h < y0) continue;
    ctx.fillStyle = '#5a5e63';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let bx = lot.x + 16; bx < lot.x + lot.w - 20; bx += 34) {
      ctx.strokeRect(bx, lot.y + 12, 30, 52);
      ctx.strokeRect(bx, lot.y + lot.h - 64, 30, 52);
    }
  }

  drawRoads(ctx, x0, y0, x1, y1);
  drawBuildings(ctx, game, x0, y0, x1, y1);
  for (const palm of city.palms) {
    if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
    drawPalm(ctx, palm);
  }
  drawGulls(ctx, game, x0, y0, x1, y1);
  drawLandmarkSigns(ctx, game, x0, y0, x1, y1);
}

function drawRoads(ctx, x0, y0, x1, y1) {
  const edge = ROAD_HALF + SIDEWALK;
  // Pavements first, wider than the asphalt.
  ctx.fillStyle = '#ddd2ba';
  for (const ax of AVENUES_X) ctx.fillRect(ax - edge, y0, edge * 2, y1 - y0);
  for (const sy of STREETS_Y) ctx.fillRect(x0, sy - edge, x1 - x0, edge * 2);
  // Asphalt.
  ctx.fillStyle = '#41464d';
  for (const ax of AVENUES_X) ctx.fillRect(ax - ROAD_HALF, y0, ROAD_HALF * 2, y1 - y0);
  for (const sy of STREETS_Y) ctx.fillRect(x0, sy - ROAD_HALF, x1 - x0, ROAD_HALF * 2);
  // Kerb lines.
  ctx.fillStyle = '#e8e2d2';
  for (const ax of AVENUES_X) {
    ctx.fillRect(ax - ROAD_HALF, y0, 3, y1 - y0);
    ctx.fillRect(ax + ROAD_HALF - 3, y0, 3, y1 - y0);
  }
  for (const sy of STREETS_Y) {
    ctx.fillRect(x0, sy - ROAD_HALF, x1 - x0, 3);
    ctx.fillRect(x0, sy + ROAD_HALF - 3, x1 - x0, 3);
  }
  // Centre dashes.
  ctx.fillStyle = '#f5c542';
  for (const ax of AVENUES_X) {
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
      if (STREETS_Y.some((sy) => Math.abs(y - sy) < ROAD_HALF + 8)) continue;
      ctx.fillRect(ax - 2, y, 4, 24);
    }
  }
  for (const sy of STREETS_Y) {
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
      if (AVENUES_X.some((ax) => Math.abs(x - ax) < ROAD_HALF + 8)) continue;
      ctx.fillRect(x, sy - 2, 24, 4);
    }
  }
  // Crosswalks at every crossing.
  ctx.fillStyle = 'rgba(240,240,235,0.55)';
  for (const ax of AVENUES_X) {
    for (const sy of STREETS_Y) {
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(ax - ROAD_HALF - 10, sy + s * 12 - 3, 8, 6);
        ctx.fillRect(ax + ROAD_HALF + 2, sy + s * 12 - 3, 8, 6);
        ctx.fillRect(ax + s * 12 - 3, sy - ROAD_HALF - 10, 6, 8);
        ctx.fillRect(ax + s * 12 - 3, sy + ROAD_HALF + 2, 6, 8);
      }
    }
  }
}

function drawBuildings(ctx, game, x0, y0, x1, y1) {
  const night = game.light.night;
  for (const b of game.city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    // Drop shadow from a low sun.
    ctx.fillStyle = 'rgba(30, 24, 16, 0.28)';
    ctx.fillRect(b.x + 12, b.y + 16, b.w, b.h);
    // Walls, a slightly inset roof, and a drawn edge so the block reads as a
    // building and not a slab of the ground it stands on.
    ctx.fillStyle = b.paint;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 9, b.y + 9, b.w - 18, b.h - 18);
    ctx.strokeStyle = 'rgba(43, 32, 22, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Windows: a seeded grid; at night some of them glow.
    const rng = makeRng(b.seed);
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let ry = 0; ry < rows; ry += 1) {
        const lit = rng();
        const wx = b.x + 13 + cx * ((b.w - 22) / cols);
        const wy = b.y + 13 + ry * ((b.h - 22) / rows);
        if (night > 0.35 && lit < night * 0.55) {
          ctx.fillStyle = 'rgba(255, 214, 130, 0.95)';
        } else {
          ctx.fillStyle = 'rgba(30, 48, 70, 0.78)';
        }
        ctx.fillRect(wx, wy, 12, 9);
      }
    }
    drawRoofDressing(ctx, b);
  }
}

/** The life on top of a building: parapet, air-con boxes, vents, a tank. */
function drawRoofDressing(ctx, b) {
  // A pale parapet lip just inside the roof's edge.
  ctx.strokeStyle = 'rgba(255, 250, 235, 0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24);
  const rng = makeRng(b.seed * 3 + 7);
  const props = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < props; i += 1) {
    const pw = 14 + rng() * 20;
    const ph = 11 + rng() * 14;
    const px = b.x + 18 + rng() * Math.max(10, b.w - 36 - pw);
    const py = b.y + 18 + rng() * Math.max(10, b.h - 36 - ph);
    ctx.fillStyle = 'rgba(20, 16, 10, 0.18)';
    ctx.fillRect(px + 3, py + 4, pw, ph);
    ctx.fillStyle = i % 2 ? '#9aa3ab' : '#7d7468';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px, py, pw, 3);
  }
  if (b.floors >= 6 && b.w > 130) {
    // A water tank on the tall ones, Coral Bay's skyline signature.
    const tx = b.x + b.w - 52;
    const ty = b.y + 20;
    ctx.fillStyle = 'rgba(20, 16, 10, 0.2)';
    ctx.fillRect(tx + 4, ty + 6, 30, 26);
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(tx, ty, 30, 26);
    ctx.beginPath();
    ctx.moveTo(tx - 3, ty);
    ctx.lineTo(tx + 15, ty - 11);
    ctx.lineTo(tx + 33, ty);
    ctx.closePath();
    ctx.fillStyle = '#6d4c41';
    ctx.fill();
  }
  if (rng() < 0.55) {
    // A shopfront awning on the street side, striped in the wall's accent.
    const aw = Math.min(b.w - 30, 90 + rng() * 80);
    const ax = b.x + 15 + rng() * Math.max(4, b.w - 30 - aw);
    const ay = b.y + b.h - 13;
    for (let s = 0; s < 6; s += 1) {
      ctx.fillStyle = s % 2 ? '#f4f1e8' : '#d95548';
      ctx.fillRect(ax + (aw / 6) * s, ay, aw / 6, 9);
    }
    ctx.fillStyle = 'rgba(20,16,10,0.25)';
    ctx.fillRect(ax, ay + 9, aw, 3);
  }
}

function drawPalm(ctx, palm) {
  ctx.strokeStyle = '#7a5c3e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(palm.x, palm.y);
  ctx.quadraticCurveTo(palm.x + palm.lean * 14, palm.y - 12, palm.x + palm.lean * 26, palm.y - 22);
  ctx.stroke();
  const topX = palm.x + palm.lean * 26;
  const topY = palm.y - 22;
  ctx.strokeStyle = '#3e8e4f';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + palm.lean;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * 13, topY + Math.sin(a) * 8 - 5,
      topX + Math.cos(a) * 24, topY + Math.sin(a) * 13 + 4,
    );
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(20,16,10,0.18)';
  ctx.beginPath();
  ctx.ellipse(palm.x, palm.y + 3, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A moored boat, bobbing on the bay: hull, cabin, mast, and its wake-ring. */
function drawBoat(ctx, boat, time) {
  const bob = Math.sin(time * 0.9 + boat.phase) * 2.2;
  ctx.save();
  ctx.translate(boat.x, boat.y + bob);
  ctx.rotate(boat.angle + Math.sin(time * 0.5 + boat.phase) * 0.03);
  const s = boat.size;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30 * s, 13 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(15, 30, 40, 0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 24 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = boat.paint;
  ctx.beginPath();
  ctx.moveTo(-22 * s, 0);
  ctx.lineTo(-14 * s, -7 * s);
  ctx.lineTo(14 * s, -7 * s);
  ctx.lineTo(24 * s, 0);
  ctx.lineTo(14 * s, 7 * s);
  ctx.lineTo(-14 * s, 7 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8f5ec';
  ctx.fillRect(-6 * s, -5 * s, 13 * s, 10 * s);
  ctx.strokeStyle = '#5a4632';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10 * s, 0);
  ctx.lineTo(10 * s, -17 * s);
  ctx.stroke();
  ctx.restore();
}

/** A beach umbrella and its towel: the sand is somebody's day out. */
function drawUmbrella(ctx, umb) {
  ctx.save();
  ctx.translate(umb.x, umb.y);
  ctx.fillStyle = 'rgba(240, 120, 90, 0.55)';
  ctx.fillRect(-13, 8, 26, 10);
  ctx.fillStyle = 'rgba(20,16,10,0.16)';
  ctx.beginPath();
  ctx.ellipse(3, 4, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(umb.tilt);
  ctx.strokeStyle = '#7a5c3e';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, -6);
  ctx.stroke();
  ctx.fillStyle = umb.paint;
  ctx.beginPath();
  ctx.moveTo(-15, -4);
  ctx.quadraticCurveTo(0, -16, 15, -4);
  ctx.quadraticCurveTo(7, -8, 0, -4);
  ctx.quadraticCurveTo(-7, -8, -15, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Gulls over the bay: two-stroke wings, circling on the sea wind. */
function drawGulls(ctx, game, x0, y0, x1, y1) {
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i += 1) {
    const cx = 120 + (i % 3) * 130;
    const cy = 300 + i * 330;
    const gx = cx + Math.cos(game.time * 0.14 + i * 1.7) * 90;
    const gy = cy + Math.sin(game.time * 0.19 + i * 2.3) * 46;
    if (gx < x0 || gx > x1 || gy < y0 || gy > y1) continue;
    const flap = Math.sin(game.time * 6 + i * 1.3) * 4;
    ctx.beginPath();
    ctx.moveTo(gx - 8, gy + flap);
    ctx.quadraticCurveTo(gx - 3, gy - 3, gx, gy);
    ctx.quadraticCurveTo(gx + 3, gy - 3, gx + 8, gy + flap);
    ctx.stroke();
  }
}

function drawLandmarkSigns(ctx, game, x0, y0, x1, y1) {
  ctx.textAlign = 'center';
  for (const mark of LANDMARKS) {
    if (mark.x < x0 || mark.x > x1 || mark.y < y0 || mark.y > y1) continue;
    const d = Math.hypot(mark.x - game.camera.x, mark.y - game.camera.y);
    if (d > 760) continue;
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(mark.name).width + 14;
    ctx.fillStyle = 'rgba(13, 20, 32, 0.66)';
    ctx.fillRect(mark.x - w / 2, mark.y - 66, w, 19);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(mark.name, mark.x, mark.y - 52);
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(mark.x - 2, mark.y - 46, 4, 18);
  }
}

/** Fading rubber: the skid marks hard driving leaves behind. */
export function drawSkids(ctx, skids) {
  ctx.fillStyle = '#1c1c1e';
  for (const s of skids) {
    ctx.globalAlpha = Math.min(0.55, s.life * 0.05);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

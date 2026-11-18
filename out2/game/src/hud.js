// Everything the player reads: the cash and the stars, the mission panel and
// its clock, the minimap with its gold objective dot and flashing police
// blips, the bust meter, Marlin's briefs, and the title / pause / busted
// screens. The world marker (a pulsing ring with a light column) lives here
// too, since it is information first and scenery second.

import { WORLD, AVENUES_X, STREETS_Y } from './config.js';
import { money, clockText, clamp } from './util.js';
import { landmarkById } from './city.js';

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(10, 16, 26, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

function shadowText(ctx, text, x, y, { font = '600 15px system-ui, sans-serif', color = '#f4f1e8', align = 'left' } = {}) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** The world-space objective marker: ring, beacon, and a floating label. */
export function drawMarker(ctx, game) {
  const job = game.job;
  const garage = landmarkById('garage');
  const target = job?.marker ?? (game.mode === 'play' ? { x: garage.x, y: garage.y, label: 'See Marlin — new job' } : null);
  if (!target) return;
  const pulse = 1 + Math.sin(game.time * 4) * 0.12;
  ctx.save();
  ctx.translate(target.x, target.y);
  // Light column so the goal reads from streets away.
  const grad = ctx.createLinearGradient(0, -190, 0, 0);
  grad.addColorStop(0, 'rgba(255, 205, 40, 0)');
  grad.addColorStop(1, 'rgba(255, 205, 40, 0.30)');
  ctx.fillStyle = grad;
  ctx.fillRect(-7, -190, 14, 190);
  ctx.strokeStyle = '#ffcd28';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 205, 40, 0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, 44 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  shadowText(ctx, target.label, target.x, target.y - 52, {
    font: '700 14px system-ui, sans-serif', color: '#ffd94d', align: 'center',
  });
  // Gates get a chequered ring instead, drawn by the same hand.
  if (job?.gates && job.gateIndex !== undefined && job.gateIndex < job.gates.length) {
    const gate = job.gates[job.gateIndex];
    ctx.save();
    ctx.translate(gate.x, gate.y);
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 ? '#111' : '#f5f5f5';
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 40, Math.sin(a) * 40, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawHud(ctx, game, view) {
  const { player, police } = game;
  // Cash and progress, top-left.
  panel(ctx, 16, 16, 218, 64);
  shadowText(ctx, money(game.cash), 30, 44, { font: '800 24px system-ui, sans-serif', color: '#8be28b' });
  const progress = game.storyIndex < 5 ? `Story job ${Math.min(game.storyIndex + 1, 5)} of 5` : `Job board · ${game.boardDone} done`;
  shadowText(ctx, progress, 30, 68, { font: '600 12.5px system-ui, sans-serif', color: '#cfd8e3' });
  if (player.hasPistol) shadowText(ctx, 'PISTOL', 222, 44, { font: '700 11px system-ui, sans-serif', color: '#ffb3a0', align: 'right' });

  drawMinimap(ctx, game, view);
  drawStars(ctx, game, view);
  drawMissionPanel(ctx, game, view);
  drawContextPanel(ctx, game, view);
  drawNotices(ctx, game, view);

  // The bust meter owns the centre of the screen while it fills.
  if (police.bust > 0.02 && game.mode === 'play') {
    const w = 300;
    panel(ctx, view.w / 2 - w / 2, view.h * 0.3, w, 40, 0.8);
    shadowText(ctx, 'BUSTED?', view.w / 2, view.h * 0.3 + 26, {
      font: '800 17px system-ui, sans-serif', color: '#ff6b5e', align: 'center',
    });
    ctx.fillStyle = '#3a0f0c';
    ctx.fillRect(view.w / 2 - w / 2 + 10, view.h * 0.3 + 30, w - 20, 5);
    ctx.fillStyle = '#ff5040';
    ctx.fillRect(view.w / 2 - w / 2 + 10, view.h * 0.3 + 30, (w - 20) * police.bust, 5);
  }

  // Marlin's brief, when a job has just been taken.
  if (game.brief && game.time < game.brief.until) {
    const lines = game.brief.lines;
    const w = 520;
    const h = 44 + lines.length * 21;
    panel(ctx, view.w / 2 - w / 2, view.h - h - 118, w, h, 0.85);
    shadowText(ctx, game.brief.title, view.w / 2, view.h - h - 118 + 28, {
      font: '800 16px system-ui, sans-serif', color: '#ffd94d', align: 'center',
    });
    lines.forEach((line, i) => {
      shadowText(ctx, line, view.w / 2, view.h - h - 118 + 54 + i * 21, {
        font: 'italic 14px Georgia, serif', color: '#f0ead8', align: 'center',
      });
    });
  }
}

function drawStars(ctx, game, view) {
  const { stars } = game.police;
  if (stars === 0) return;
  const cx = view.w / 2;
  const y = 34;
  shadowText(ctx, 'CBPD', cx - 78, y + 5, { font: '800 13px system-ui, sans-serif', color: '#ffb3a0', align: 'right' });
  for (let i = 0; i < 5; i += 1) {
    const x = cx - 52 + i * 27;
    drawStar(ctx, x, y, 11, i < stars ? '#ffd94d' : 'rgba(255,255,255,0.25)');
  }
  if (game.police.hideTime > 2.2) {
    shadowText(ctx, 'losing them…', cx + 92, y + 5, { font: '600 12px system-ui, sans-serif', color: '#a8e6a1' });
  }
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMinimap(ctx, game, view) {
  const w = 208;
  const h = 150;
  const x = view.w - w - 16;
  const y = 16;
  const s = Math.min(w / WORLD.width, h / WORLD.height);
  panel(ctx, x - 6, y - 6, w + 12, h + 26, 0.66);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#274b63';
  ctx.fillRect(x, y, WORLD.waterEdge * s, h);
  ctx.fillStyle = '#8f9c76';
  ctx.fillRect(x + WORLD.waterEdge * s, y, w - WORLD.waterEdge * s, h);
  ctx.strokeStyle = 'rgba(240,240,230,0.75)';
  ctx.lineWidth = 2;
  for (const ax of AVENUES_X) {
    ctx.beginPath();
    ctx.moveTo(x + ax * s, y);
    ctx.lineTo(x + ax * s, y + h);
    ctx.stroke();
  }
  for (const sy of STREETS_Y) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * s);
    ctx.lineTo(x + w, y + sy * s);
    ctx.stroke();
  }
  // Objective, rivals, police, player.
  const target = game.job?.marker ?? (game.mode === 'play' ? landmarkById('garage') : null);
  if (target) {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(x + target.x * s, y + target.y * s, 4.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.job?.targets) {
    ctx.fillStyle = '#ff5040';
    for (const car of game.job.targets) {
      if (car.wrecked) continue;
      ctx.fillRect(x + car.x * s - 2.4, y + car.y * s - 2.4, 4.8, 4.8);
    }
  }
  const flash = Math.floor(game.time * 3) % 2 === 0;
  for (const cop of game.police.cruisers) {
    ctx.fillStyle = flash ? '#ff4040' : '#4d7dff';
    ctx.fillRect(x + cop.x * s - 2.4, y + cop.y * s - 2.4, 4.8, 4.8);
  }
  const p = game.player;
  ctx.save();
  ctx.translate(x + p.x * s, y + p.y * s);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -3.6);
  ctx.lineTo(-4.4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  shadowText(ctx, 'CORAL BAY', x + w / 2, y + h + 18, { font: '700 10.5px system-ui, sans-serif', color: '#cfd8e3', align: 'center' });
}

function drawMissionPanel(ctx, game, view) {
  const job = game.job;
  const y = view.h - 96;
  panel(ctx, 16, y, 372, 80);
  if (job) {
    shadowText(ctx, job.title.toUpperCase(), 30, y + 24, { font: '800 13px system-ui, sans-serif', color: '#ffd94d' });
    shadowText(ctx, job.objective, 30, y + 47, { font: '600 14.5px system-ui, sans-serif' });
    const dist = job.marker ? Math.round(Math.hypot(job.marker.x - game.player.x, job.marker.y - game.player.y) / 9) : 0;
    let line = job.marker ? `${dist} m · pays ${money(job.pay)}` : `Pays ${money(job.pay)}`;
    if (job.timeLeft !== null && job.timeLeft !== undefined) {
      line += ` · ${clockText(job.timeLeft)}`;
    }
    shadowText(ctx, line, 30, y + 68, {
      font: '700 13px system-ui, sans-serif',
      color: job.timeLeft !== null && job.timeLeft !== undefined && job.timeLeft < 20 ? '#ff6b5e' : '#a8e6a1',
    });
  } else {
    shadowText(ctx, game.storyIndex < 5 ? 'FREE ROAM' : 'JOB BOARD', 30, y + 24, { font: '800 13px system-ui, sans-serif', color: '#ffd94d' });
    shadowText(ctx, game.storyIndex < 5 ? 'See Marlin at Doss Auto & Salvage for work' : 'The board at the garage always has another job', 30, y + 47, { font: '600 14.5px system-ui, sans-serif' });
    shadowText(ctx, 'Mug, jack and hustle in the meantime — quietly', 30, y + 68, { font: '600 12.5px system-ui, sans-serif', color: '#cfd8e3' });
  }
}

function drawContextPanel(ctx, game, view) {
  const y = view.h - 96;
  const w = 252;
  const x = view.w - w - 16;
  panel(ctx, x, y, w, 80);
  if (game.player.car) {
    const car = game.player.car;
    const mph = Math.round(Math.abs(car.speed) * 0.21);
    shadowText(ctx, car.model.name.toUpperCase(), x + 14, y + 24, { font: '800 13px system-ui, sans-serif', color: '#ffd94d' });
    shadowText(ctx, `${mph} mph`, x + w - 14, y + 44, { font: '800 26px system-ui, sans-serif', align: 'right' });
    // Condition bar.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x + 14, y + 58, w - 28, 7);
    ctx.fillStyle = car.health > 45 ? '#8be28b' : car.health > 20 ? '#ffd94d' : '#ff6b5e';
    ctx.fillRect(x + 14, y + 58, (w - 28) * clamp(car.health, 0, 100) / 100, 7);
    shadowText(ctx, 'E — get out', x + 14, y + 47, { font: '600 12px system-ui, sans-serif', color: '#cfd8e3' });
  } else if (game.prompt) {
    shadowText(ctx, game.prompt, x + w / 2, y + 47, { font: '700 14.5px system-ui, sans-serif', color: '#ffd94d', align: 'center' });
  } else {
    shadowText(ctx, 'WASD move · Shift sprint', x + w / 2, y + 32, { font: '600 12.5px system-ui, sans-serif', color: '#cfd8e3', align: 'center' });
    shadowText(ctx, 'E enter car · F mug · mouse aims the pistol', x + w / 2, y + 52, { font: '600 12.5px system-ui, sans-serif', color: '#cfd8e3', align: 'center' });
  }
}

function drawNotices(ctx, game, view) {
  let y = 96;
  for (const note of game.notices) {
    if (game.time > note.until) continue;
    panel(ctx, 16, y, Math.min(430, 26 + note.text.length * 7.4), 30, 0.62);
    shadowText(ctx, note.text, 28, y + 20, { font: '600 13.5px system-ui, sans-serif', color: '#ffe9b0' });
    y += 38;
  }
  void view;
}

/** Full-screen sheets: title, pause, busted. */
export function drawTitle(ctx, game, view) {
  ctx.fillStyle = 'rgba(8, 12, 22, 0.45)';
  ctx.fillRect(0, 0, view.w, view.h);
  shadowText(ctx, 'CORAL BAY', view.w / 2, view.h * 0.3, { font: '900 74px system-ui, sans-serif', color: '#ffd94d', align: 'center' });
  shadowText(ctx, 'H E A T', view.w / 2, view.h * 0.3 + 62, { font: '900 40px system-ui, sans-serif', color: '#ff6f61', align: 'center' });
  shadowText(ctx, 'An open-world crime sandbox — steal it, run it, wreck it, outrun the CBPD', view.w / 2, view.h * 0.3 + 98, {
    font: 'italic 16px Georgia, serif', color: '#f0ead8', align: 'center',
  });
  const items = game.hasSave ? ['Continue', 'New game'] : ['New game'];
  items.forEach((label, i) => {
    const y = view.h * 0.52 + i * 46;
    const selected = game.menuIndex === i;
    if (selected) {
      ctx.fillStyle = 'rgba(255, 217, 77, 0.9)';
      ctx.beginPath();
      ctx.roundRect(view.w / 2 - 130, y - 26, 260, 38, 9);
      ctx.fill();
    }
    shadowText(ctx, label, view.w / 2, y, {
      font: '800 21px system-ui, sans-serif', color: selected ? '#14202e' : '#f4f1e8', align: 'center',
    });
  });
  shadowText(ctx, 'Mari Solano owes Marlin Doss one favour. Coral Bay will collect the rest.', view.w / 2, view.h * 0.52 + items.length * 46 + 26, {
    font: '600 13.5px system-ui, sans-serif', color: '#cfd8e3', align: 'center',
  });
  shadowText(ctx, 'WASD drive & walk · E in/out of cars · F mug · Shift sprint · Space handbrake · Esc pause', view.w / 2, view.h - 34, {
    font: '600 12.5px system-ui, sans-serif', color: '#9fb2c8', align: 'center',
  });
}

export function drawPause(ctx, game, view) {
  ctx.fillStyle = 'rgba(8, 12, 22, 0.55)';
  ctx.fillRect(0, 0, view.w, view.h);
  shadowText(ctx, 'PAUSED', view.w / 2, view.h * 0.36, { font: '900 44px system-ui, sans-serif', color: '#ffd94d', align: 'center' });
  const items = ['Back to the bay', 'Restart the day', 'Quit to title'];
  items.forEach((label, i) => {
    const y = view.h * 0.48 + i * 42;
    const selected = game.menuIndex === i;
    if (selected) {
      ctx.fillStyle = 'rgba(255, 217, 77, 0.9)';
      ctx.beginPath();
      ctx.roundRect(view.w / 2 - 140, y - 24, 280, 36, 9);
      ctx.fill();
    }
    shadowText(ctx, label, view.w / 2, y, { font: '800 19px system-ui, sans-serif', color: selected ? '#14202e' : '#f4f1e8', align: 'center' });
  });
}

export function drawBusted(ctx, game, view) {
  ctx.fillStyle = 'rgba(30, 6, 4, 0.62)';
  ctx.fillRect(0, 0, view.w, view.h);
  shadowText(ctx, 'BUSTED', view.w / 2, view.h * 0.38, { font: '900 64px system-ui, sans-serif', color: '#ff5040', align: 'center' });
  shadowText(ctx, `The CBPD impound your ride and fine you ${money(game.bustFine)}.`, view.w / 2, view.h * 0.38 + 44, {
    font: '600 16px system-ui, sans-serif', color: '#f0ead8', align: 'center',
  });
  shadowText(ctx, 'You walk out of the station on Sundial St. The bay keeps turning.', view.w / 2, view.h * 0.38 + 70, {
    font: 'italic 14px Georgia, serif', color: '#cfd8e3', align: 'center',
  });
  shadowText(ctx, 'Press Enter', view.w / 2, view.h * 0.38 + 116, { font: '800 17px system-ui, sans-serif', color: '#ffd94d', align: 'center' });
}

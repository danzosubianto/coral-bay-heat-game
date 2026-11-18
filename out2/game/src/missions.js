// The work of Coral Bay: a five-job story chain for Marlin Doss, then an
// endless board of the same trades at rising pay. A job is a small state
// machine — reach a place, take a car, beat a clock, run fares, wreck rivals
// — and this module owns the machines: starting them, stepping them, paying
// them, and failing them when the clock runs out. The HUD asks the active
// job for its objective text and its marker; main.js asks whether the player
// is standing in the garage marker to start the next one.

import { CAR_MODELS, STREETS_Y, AVENUES_X } from './config.js';
import { landmarkById } from './city.js';
import { makeCar, placeOnRoad } from './vehicles.js';
import { money } from './util.js';

const ZEPHYR = CAR_MODELS.find((m) => m.id === 'zephyr');
const CAB = CAR_MODELS.find((m) => m.id === 'cab');
const DARTER = CAR_MODELS.find((m) => m.id === 'darter');
const VOYAGER = CAR_MODELS.find((m) => m.id === 'voyager');

function baseJob(title, pay, brief) {
  return {
    title, pay, brief,
    timeLeft: null, // seconds, when the job is against the clock
    marker: null, // {x, y, label}
    objective: brief[brief.length - 1],
    update() { return null; },
  };
}

function reach(game, x, y, r = 48) {
  return Math.hypot(game.player.x - x, game.player.y - y) < r;
}

/** Job 1: steal the Zephyr parked by Palms Mall and bring it to the garage. */
function jobFirstWheels(game) {
  const mall = landmarkById('mall');
  const garage = landmarkById('garage');
  const car = makeCar(ZEPHYR, mall.x - 60, mall.y - 120, Math.PI / 2, '#ffb703', 'traffic');
  car.driver = false;
  car.jobOwned = true;
  game.cars.push(car);
  const job = baseJob('First Wheels', 400, [
    'Marlin: "A Zephyr GT sits by Palms Mall, keys in it,',
    'owner behind on his payments. Bring it home, Mari."',
  ]);
  job.marker = { x: car.x, y: car.y, label: 'Steal the Zephyr GT' };
  job.objective = 'Steal the Zephyr GT by Palms Mall';
  let stage = 0;
  job.update = (g) => {
    if (stage === 0) {
      if (g.player.car === car) {
        stage = 1;
        job.marker = { x: garage.x, y: garage.y, label: 'Deliver to the garage' };
        job.objective = "Deliver the Zephyr to Marlin's garage";
        g.notify('Got it — now get it home');
      } else if (car.wrecked) return 'fail';
    } else if (g.player.car === car && reach(g, garage.x, garage.y, 62)) {
      return 'done';
    }
    return null;
  };
  return job;
}

/** Job 2: a timed package run, marina to diner. The pay includes a pistol. */
function jobHotPackage(game) {
  const marina = landmarkById('marina');
  const diner = landmarkById('diner');
  const job = baseJob('Hot Package', 650, [
    'Marlin: "Package waiting at the marina, and the Gull',
    'is expecting it warm. Clock is running. Take this',
    'pistol, too — the Vipers have been asking questions."',
  ]);
  job.marker = { x: marina.x, y: marina.y, label: 'Pick up the package' };
  job.objective = 'Pick up the package at the marina';
  let stage = 0;
  job.update = (g) => {
    if (stage === 0 && reach(g, marina.x, marina.y, 52)) {
      stage = 1;
      job.timeLeft = 150;
      job.marker = { x: diner.x, y: diner.y, label: 'Deliver to the Salty Gull' };
      job.objective = 'Deliver the package to the Salty Gull — fast';
      g.notify('Package aboard. The clock is ticking');
    } else if (stage === 1 && reach(g, diner.x, diner.y, 52)) {
      g.player.hasPistol = true;
      return 'done';
    }
    return null;
  };
  return job;
}

/** Job 3: six gates across town, one clock, any car you can keep straight. */
const GATE_SPOTS = [
  { x: 1080, y: 720 }, { x: 1960, y: 320 }, { x: 2840, y: 1120 },
  { x: 2400, y: 1920 }, { x: 1520, y: 2320 }, { x: 640, y: 1520 },
];
function jobGateCrasher(game) {
  const job = baseJob('Gate Crasher', 900, [
    'Marlin: "Six gates, one clock, whole town watching.',
    'Show the Vipers how a Solano drives."',
  ]);
  job.timeLeft = 110;
  job.gates = GATE_SPOTS.map((g) => ({ ...g }));
  job.gateIndex = 0;
  job.marker = { ...GATE_SPOTS[0], label: 'Gate 1 of 6' };
  job.objective = 'Hit gate 1 of 6';
  job.update = (g) => {
    if (!g.player.car) {
      job.objective = 'You need wheels for the gates';
      return null;
    }
    const gate = GATE_SPOTS[job.gateIndex];
    job.objective = `Hit gate ${job.gateIndex + 1} of 6`;
    if (reach(g, gate.x, gate.y, 58)) {
      job.gateIndex += 1;
      g.audio.cash();
      if (job.gateIndex >= GATE_SPOTS.length) return 'done';
      const next = GATE_SPOTS[job.gateIndex];
      job.marker = { ...next, label: `Gate ${job.gateIndex + 1} of 6` };
      g.notify(`Gate ${job.gateIndex} cleared — ${GATE_SPOTS.length - job.gateIndex} to go`);
    }
    return null;
  };
  return job;
}

/** Job 4: borrow the depot cab and run three clean fares. */
function jobCabConfidential(game) {
  const depot = landmarkById('cabdepot');
  const cab = makeCar(CAB, depot.x - 40, depot.y + 66, 0, CAB.paints[0], 'cab');
  cab.driver = false;
  cab.jobOwned = true;
  cab.arranged = true; // Sunfare owes Marlin: taking it is business, not theft
  game.cars.push(cab);
  const job = baseJob('Cab Confidential', 150, [
    'Marlin: "Sunfare owes me three favours. Take the',
    'depot cab, run three fares clean, and we are square."',
  ]);
  job.marker = { x: cab.x, y: cab.y, label: 'Take the Sunfare cab' };
  job.objective = 'Take the cab at the Sunfare depot';
  job.faresDone = 0;
  job.faresTotal = 3;
  let stage = 'getcab'; // getcab | pickup | dropoff
  let farePed = null;
  let fareDest = null;
  let fareTime = 0;
  const newFare = (g, exclude = null) => {
    farePed = g.nearestWaitingPed(exclude);
    if (!farePed) return;
    farePed.mode = 'hail';
    job.marker = { x: farePed.x, y: farePed.y, label: `Pick up ${farePed.name}` };
    job.objective = `Pick up ${farePed.name} — they are waving for a cab`;
    stage = 'pickup';
  };
  job.update = (g, dt) => {
    if (stage === 'getcab') {
      if (g.player.car === cab) {
        g.notify('Fares will wave from the kerb. Stop close and wait');
        newFare(g);
      }
      return null;
    }
    if (stage === 'pickup') {
      if (!farePed || farePed.mode === 'down') { newFare(g); return null; }
      job.marker = { x: farePed.x, y: farePed.y, label: `Pick up ${farePed.name}` };
      if (g.player.car === cab && Math.abs(cab.speed) < 14 && reach(g, farePed.x, farePed.y, 44)) {
        farePed.mode = 'aboard';
        const spots = ['hotel', 'mall', 'diner', 'marina', 'garage'];
        fareDest = landmarkById(spots[Math.floor(g.rng() * spots.length)]);
        job.marker = { x: fareDest.x, y: fareDest.y, label: `Drop at ${fareDest.short}` };
        job.objective = `Take ${farePed.name} to ${fareDest.short}`;
        fareTime = 0;
        stage = 'dropoff';
      }
      return null;
    }
    // dropoff
    fareTime += dt || 0;
    if (g.player.car === cab && reach(g, fareDest.x, fareDest.y, 56)) {
      const fare = 180 + Math.round(Math.hypot(fareDest.x - farePed.x, fareDest.y - farePed.y) / 12);
      const tip = fareTime < 100 ? 60 : 0;
      g.earn(fare + tip, tip ? `Fare paid ${money(fare)} + ${money(tip)} tip` : `Fare paid ${money(fare)}`);
      const dropped = farePed;
      dropped.mode = 'walk';
      dropped.x = fareDest.x + 16;
      dropped.y = fareDest.y + 10;
      farePed = null;
      job.faresDone += 1;
      if (job.faresDone >= job.faresTotal) return 'done';
      job.objective = 'Next fare — watch the kerbs';
      newFare(g, dropped);
    }
    return null;
  };
  return job;
}

/** Job 5: five Viper rides around their den, and not one of them drivable after. */
function jobWreckingCrew(game) {
  const den = landmarkById('vipers');
  const job = baseJob('Wrecking Crew', 1500, [
    'Marlin: "Five Viper rides parked up by their den.',
    'Total them, Mari. All five. Send a message."',
  ]);
  job.timeLeft = 240;
  job.targets = [];
  const paints = ['#386641', '#2a9d8f', '#606c38', '#588157', '#3a5a40'];
  for (let i = 0; i < 5; i += 1) {
    const model = i % 2 ? VOYAGER : DARTER;
    // Parked nose-to-tail along Sundial St in front of the den, where a car
    // can actually reach them — a crew showing off its rides on the street.
    const car = makeCar(model, den.x - 190 + i * 78, 1896 + (i % 2) * 52, i % 2 ? 0.06 : -0.04, paints[i], 'rival');
    car.driver = false;
    car.jobOwned = true;
    game.cars.push(car);
    job.targets.push(car);
  }
  job.marker = { x: den.x, y: 1920, label: 'Wreck the Viper rides' };
  job.objective = 'Wreck the Viper rides (0 of 5)';
  job.update = (g) => {
    const done = job.targets.filter((c) => c.wrecked).length;
    job.objective = `Wreck the Viper rides (${done} of 5)`;
    return done >= 5 ? 'done' : null;
  };
  return job;
}

export const STORY_JOBS = [jobFirstWheels, jobHotPackage, jobGateCrasher, jobCabConfidential, jobWreckingCrew];
export const STORY_COUNT = STORY_JOBS.length;

/** After the story: the board. Same trades, new corners, rising pay. */
export function makeBoardJob(game) {
  const kinds = ['deliver', 'package', 'gates', 'fares', 'wreck'];
  const kind = kinds[Math.floor(game.rng() * kinds.length)];
  const scale = 1 + game.boardDone * 0.07;
  let job;
  if (kind === 'deliver') {
    const spots = ['mall', 'hotel', 'diner', 'cabdepot', 'vipers'];
    const from = landmarkById(spots[Math.floor(game.rng() * spots.length)]);
    const to = landmarkById('garage');
    const model = game.rng() < 0.4 ? ZEPHYR : VOYAGER;
    const car = makeCar(model, from.x - 50, from.y - 110, Math.PI / 2, model.paints[Math.floor(game.rng() * model.paints.length)], 'traffic');
    car.driver = false;
    car.jobOwned = true;
    game.cars.push(car);
    job = baseJob('Board: Hot Wheels', Math.round(420 * scale), ['Marlin: "Another one behind on payments. Fetch and deliver."']);
    job.marker = { x: car.x, y: car.y, label: 'Take the car' };
    job.objective = `Take the ${model.name} by ${from.short}`;
    let stage = 0;
    job.update = (g) => {
      if (stage === 0 && g.player.car === car) {
        stage = 1;
        job.marker = { x: to.x, y: to.y, label: 'Deliver to the garage' };
        job.objective = "Deliver it to Marlin's garage";
      } else if (stage === 1 && g.player.car === car && reach(g, to.x, to.y, 62)) return 'done';
      if (car.wrecked) return 'fail';
      return null;
    };
  } else if (kind === 'package') {
    const a = landmarkById(['marina', 'mall', 'hotel'][Math.floor(game.rng() * 3)]);
    const b = landmarkById(['diner', 'cabdepot', 'vipers'][Math.floor(game.rng() * 3)]);
    job = baseJob('Board: Rush Order', Math.round(560 * scale), ['Marlin: "Rush order. Pick it up, drop it off, mind the clock."']);
    job.marker = { x: a.x, y: a.y, label: 'Pick up' };
    job.objective = `Pick up at ${a.short}`;
    let stage = 0;
    job.update = (g) => {
      if (stage === 0 && reach(g, a.x, a.y, 52)) {
        stage = 1;
        job.timeLeft = 120;
        job.marker = { x: b.x, y: b.y, label: 'Drop off' };
        job.objective = `Drop off at ${b.short} — fast`;
      } else if (stage === 1 && reach(g, b.x, b.y, 52)) return 'done';
      return null;
    };
  } else if (kind === 'gates') {
    job = jobGateCrasher(game);
    job.title = 'Board: Gate Run';
    job.pay = Math.round(760 * scale);
    job.timeLeft = 95;
  } else if (kind === 'fares') {
    job = jobCabConfidential(game);
    job.title = 'Board: Cab Shift';
    job.pay = Math.round(220 * scale);
    job.faresTotal = 2;
  } else {
    job = jobWreckingCrew(game);
    job.title = 'Board: Demolition';
    job.pay = Math.round(1200 * scale);
    job.timeLeft = 210;
    job.targets = job.targets.slice(0, 3);
    job.objective = 'Wreck the Viper rides (0 of 3)';
    job.update = () => {
      const done = job.targets.filter((c) => c.wrecked).length;
      job.objective = `Wreck the Viper rides (${done} of 3)`;
      return done >= 3 ? 'done' : null;
    };
  }
  return job;
}

/** Step the active job; returns 'done' or 'fail' when it resolves. */
export function updateJob(game, dt) {
  const job = game.job;
  if (!job) return null;
  if (job.timeLeft !== null && job.timeLeft !== undefined) {
    job.timeLeft -= dt;
    if (job.timeLeft <= 0) return 'fail';
  }
  return job.update(game, dt);
}

// Kept for the HUD's street flavour: which crossing a point belongs to.
export function gateAt(index) {
  return { x: AVENUES_X[index % AVENUES_X.length], y: STREETS_Y[index % STREETS_Y.length] };
}

// The staged scenes behind ?shot=chase|avenue|taxi|title. Each one arranges
// the real game — its own cars, police, jobs and HUD — into the moment the
// screenshots need, then lets the simulation run: the chase really is being
// chased, the cab really is waiting on a fare. Nothing here is drawn that the
// game itself did not draw.

import { CAR_MODELS } from './config.js';
import { makeCar, placeOnRoad } from './vehicles.js';
import { landmarkById } from './city.js';

const ZEPHYR = CAR_MODELS.find((m) => m.id === 'zephyr');
const VOYAGER = CAR_MODELS.find((m) => m.id === 'voyager');
const CAB = CAR_MODELS.find((m) => m.id === 'cab');
const CRUISER = CAR_MODELS.find((m) => m.id === 'cruiser');

export function stageShot(game, name) {
  game.shotMode = true;
  if (name === 'avenue') stageAvenue(game);
  else if (name === 'chase') stageChase(game);
  else if (name === 'taxi') stageTaxi(game);
  else stageTitle(game);
}

/** The cover's promise: a chase at dusk, four stars, a roadblock ahead. */
function stageChase(game) {
  game.mode = 'play';
  game.hour = 19.35;
  game.cash = 1240;
  game.startJob(); // First Wheels on the panel: a job to finish if she lands
  game.brief = null; // the brief box would sit on the chase; the panel tells it
  const { player, police } = game;
  // Mari in a borrowed Voyager, northbound on Harbor Ave at speed, mid-block
  // with open road ahead of her and the law stacked up behind.
  const car = makeCar(VOYAGER, 1960 - 23, 1760, -Math.PI / 2, '#5b6abf', 'player');
  car.speed = 335;
  car.driver = false;
  game.cars.push(car);
  player.car = car;
  player.lastCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  // Three cruisers on her tail, close enough to read the plate.
  police.stars = 4;
  police.blockCooldown = 30; // the staged roadblock below is the one she faces
  const spots = [
    { x: 1960 - 23, y: 1895, a: -Math.PI / 2 },
    { x: 1960 + 23, y: 1985, a: -Math.PI / 2 },
    { x: 1960 - 20, y: 2075, a: -Math.PI / 2 },
  ];
  for (const s of spots) {
    const cop = makeCar(CRUISER, s.x, s.y, s.a, CRUISER.paints[0], 'cruiser');
    cop.speed = 315;
    cop.driver = true;
    placeOnRoad(cop, true, 3, -1, s.y);
    cop.x = s.x;
    cop.y = s.y;
    cop.angle = s.a;
    cop.speed = 315;
    game.cars.push(cop);
    police.cruisers.push(cop);
  }
  // And the fourth star's answer: two cruisers parked across Harbor Ave on
  // the far side of the Palmetto St crossing, square in her headlights —
  // far enough ahead that the shot catches the moment before the meeting.
  for (const side of [-1, 1]) {
    const block = makeCar(CRUISER, 1960 + side * 27, 1470, side > 0 ? 0.16 : Math.PI - 0.16, CRUISER.paints[0], 'cruiser');
    block.roadblock = true;
    block.driver = false;
    game.cars.push(block);
    police.cruisers.push(block);
  }
  // Rubber on the road behind her, and a story job waiting once she lands.
  for (let i = 0; i < 26; i += 1) {
    game.skids.push({ x: 1960 - 30 + (i % 3) * 4, y: 1820 + i * 9, life: 12 });
    game.skids.push({ x: 1960 - 12 + (i % 3) * 4, y: 1820 + i * 9, life: 12 });
  }
  game.camera.x = car.x + 40;
  game.camera.y = car.y + 120;
}

/** Morning on Breakwater Ave: traffic, sun, and a Zephyr with Mari's name on it. */
function stageAvenue(game) {
  game.mode = 'play';
  game.hour = 10.4;
  game.cash = 250;
  game.startJob(); // First Wheels: the HUD carries the objective and marker
  const { player } = game;
  const car = makeCar(ZEPHYR, 640 - 23, 1440, Math.PI / 2, '#fb8500', 'player');
  car.speed = 285;
  car.driver = false;
  game.cars.push(car);
  player.car = car;
  player.lastCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  game.camera.x = car.x - 30;
  game.camera.y = car.y + 90;
}

/** A Sunfare cab, a waving fare, and the Coral Crown across town. */
function stageTaxi(game) {
  game.mode = 'play';
  game.hour = 13.2;
  game.cash = 890;
  game.storyIndex = 3;
  const { player } = game;
  const hotel = landmarkById('hotel');
  // The cab is already at the kerb mid-block, meter running, a few metres
  // short of Rosa: close enough to read the scene, not close enough to
  // board her. (Mid-block, because a crossing invites the whole town in.)
  const cab = makeCar(CAB, 1520 + 23, 1330, Math.PI / 2, CAB.paints[0], 'cab');
  cab.speed = 0;
  cab.driver = false;
  game.cars.push(cab);
  player.car = cab;
  player.lastCar = cab;
  player.x = cab.x;
  player.y = cab.y;
  player.angle = cab.angle;
  // The fare, kerbside and hopeful, just ahead of the cab.
  const fare = game.peds.find((p) => p.mode === 'walk');
  if (fare) {
    fare.mode = 'hail';
    fare.x = 1520 + 54;
    fare.y = 1405;
    fare.name = 'Rosa';
    game.job = {
      title: 'Cab Confidential',
      pay: 150,
      objective: 'Pick up Rosa — she is waving for a cab',
      marker: { x: fare.x, y: fare.y, label: 'Pick up Rosa' },
      timeLeft: null,
      update: () => null,
    };
    game.prompt = '';
    void hotel;
  }
  game.camera.x = cab.x + 30;
  game.camera.y = cab.y + 60;
}

/** The title card over the marina at golden hour. */
function stageTitle(game) {
  game.mode = 'title';
  game.hour = 17.9;
  game.menuIndex = 0;
  game.camera.x = 905;
  game.camera.y = 1120;
}

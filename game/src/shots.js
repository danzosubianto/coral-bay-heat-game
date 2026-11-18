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

/** The cover's promise: a chase at dusk, three stars, nowhere clean to run. */
function stageChase(game) {
  game.mode = 'play';
  game.hour = 18.7;
  game.cash = 1240;
  const { player, police } = game;
  // Mari in a borrowed Voyager, northbound on Harbor Ave at speed.
  const car = makeCar(VOYAGER, 1960 - 23, 1500, -Math.PI / 2, '#5b6abf', 'player');
  car.speed = 330;
  car.driver = false;
  game.cars.push(car);
  player.car = car;
  player.lastCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  // Three cruisers on her tail, close enough to read the plate.
  police.stars = 3;
  const spots = [
    { x: 1960 - 23, y: 1620, a: -Math.PI / 2 },
    { x: 1960 + 23, y: 1705, a: -Math.PI / 2 },
    { x: 1960 - 20, y: 1810, a: -Math.PI / 2 },
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
  // Rubber on the road behind her, and a story job waiting once she lands.
  for (let i = 0; i < 26; i += 1) {
    game.skids.push({ x: 1960 - 30 + (i % 3) * 4, y: 1560 + i * 9, life: 12 });
    game.skids.push({ x: 1960 - 12 + (i % 3) * 4, y: 1560 + i * 9, life: 12 });
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
  const car = makeCar(ZEPHYR, 640 - 23, 1330, Math.PI / 2, '#fb8500', 'player');
  car.speed = 265;
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
  const cab = makeCar(CAB, 1520 + 23, 1010, Math.PI / 2, CAB.paints[0], 'cab');
  cab.speed = 150;
  cab.driver = false;
  game.cars.push(cab);
  player.car = cab;
  player.lastCar = cab;
  player.x = cab.x;
  player.y = cab.y;
  player.angle = cab.angle;
  // The fare, kerbside and hopeful, a block ahead of the cab.
  const fare = game.peds.find((p) => p.mode === 'walk');
  if (fare) {
    fare.mode = 'hail';
    fare.x = 1520 + 54;
    fare.y = 1150;
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
  game.camera.y = cab.y + 110;
}

/** The title card over the marina at golden hour. */
function stageTitle(game) {
  game.mode = 'title';
  game.hour = 17.9;
  game.menuIndex = 0;
  game.camera.x = 980;
  game.camera.y = 1120;
}

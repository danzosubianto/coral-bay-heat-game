// Coral Bay's fixed facts: the shape of the world, the road grid every driver
// follows, the car models on its streets, and the names on its signs. The city
// is generated from these numbers in city.js, so this file is the map's truth.

export const WORLD = {
  width: 3600,
  height: 2600,
  waterEdge: 430, // x below this is the bay itself
  beachEdge: 560, // sand runs from the water to here; the city starts after
};

// Road centrelines. Vertical avenues run north-south, horizontal streets
// east-west; every crossing of the two is an intersection traffic can turn at.
export const AVENUES_X = [640, 1080, 1520, 1960, 2400, 2840, 3280];
export const STREETS_Y = [320, 720, 1120, 1520, 1920, 2320];
export const ROAD_HALF = 46; // half the road's width, centreline to kerb
export const LANE_OFFSET = 23; // a lane's distance from the centreline
export const SIDEWALK = 14; // pavement width beyond the kerb

export const AVENUE_NAMES = [
  'Breakwater Ave',
  'Doss Ave',
  'Flamingo Ave',
  'Harbor Ave',
  'Kingfisher Ave',
  'Marlin Ave',
  'Outrigger Ave',
];
export const STREET_NAMES = [
  'First St',
  'Gull St',
  'Marina St',
  'Palmetto St',
  'Sundial St',
  'Lowtide St',
];

// Sun-soaked paint for the blocks: stucco pastels with the odd glass tower.
export const BUILDING_PAINTS = [
  '#f2c094', '#e8907c', '#f7e3b0', '#a8d5ba', '#8fc1d4', '#f4a6c0',
  '#d9c7e7', '#f9f0dc', '#ffb26b', '#7fb3a3', '#e5e0d8', '#c9d96f',
];
export const ROOF_PAINTS = ['#b5654d', '#8d6e63', '#a1887f', '#6d8ea0', '#795548', '#90a4ae'];

// The traffic of Coral Bay. topSpeed is px/s, accel px/s^2; grip scales how
// hard the car can turn at speed; worth is what a delivered one might pay.
export const CAR_MODELS = [
  { id: 'darter', name: 'Darter', length: 62, width: 30, topSpeed: 305, accel: 235, grip: 2.6, paints: ['#c94f4f', '#4f79c9', '#e0e4ea', '#3f3f46'] },
  { id: 'voyager', name: 'Voyager', length: 74, width: 33, topSpeed: 335, accel: 225, grip: 2.3, paints: ['#5b6abf', '#8a8f98', '#2e2a26', '#7a4a2b'] },
  { id: 'mule', name: 'Mule Pickup', length: 80, width: 35, topSpeed: 295, accel: 205, grip: 2.0, paints: ['#b08968', '#606c38', '#495057', '#dda15e'] },
  { id: 'zephyr', name: 'Zephyr GT', length: 72, width: 32, topSpeed: 430, accel: 330, grip: 2.9, paints: ['#ffb703', '#fb8500', '#023047', '#e5383b'] },
  { id: 'cab', name: 'Sunfare Cab', length: 74, width: 33, topSpeed: 325, accel: 220, grip: 2.3, paints: ['#ffd60a'] },
  { id: 'cruiser', name: 'CBPD Cruiser', length: 76, width: 34, topSpeed: 395, accel: 300, grip: 2.6, paints: ['#1d2733'] },
];

export const PED_PAINTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#90be6d', '#f9c74f', '#43aa8b', '#577590'];
export const PED_NAMES = [
  'Ana', 'Bruno', 'Celia', 'Dario', 'Elena', 'Felix', 'Greta', 'Hugo',
  'Ines', 'Jorge', 'Kira', 'Luis', 'Marta', 'Nico', 'Olga', 'Pablo',
  'Rosa', 'Santi', 'Tania', 'Umar', 'Vera', 'Waldo', 'Yara', 'Zeke',
];

// Who the player is, who gives the work, and who gives chase.
export const PEOPLE = {
  player: 'Mari Solano',
  fixer: 'Marlin Doss',
  fixerShop: 'Doss Auto & Salvage',
  police: 'CBPD',
  rivalCrew: 'the Vipers',
};

export const SAVE_KEY = 'coral-bay-heat-save-v1';

// A full day in Coral Bay lasts eight real minutes; the light follows it.
export const DAY_LENGTH_SECONDS = 480;
export const DAY_START_HOUR = 9.5; // a fresh game opens mid-morning

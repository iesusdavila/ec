export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BalanceLevel {
  name: string;
  walls: Rect[];
  hazards: Rect[];
  start: { x: number; y: number };
  goal: { x: number; y: number; r: number };
}

/** Espacio de mundo fijo: 1000x600, independiente del tamaño real del canvas. */
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 600;

export const LEVELS: BalanceLevel[] = [
  {
    name: "Nivel 1",
    start: { x: 60, y: 300 },
    goal: { x: 920, y: 300, r: 30 },
    walls: [
      { x: 0, y: 0, w: WORLD_WIDTH, h: 20 },
      { x: 0, y: WORLD_HEIGHT - 20, w: WORLD_WIDTH, h: 20 },
      { x: 0, y: 0, w: 20, h: WORLD_HEIGHT },
      { x: WORLD_WIDTH - 20, y: 0, w: 20, h: WORLD_HEIGHT },
      { x: 420, y: 0, w: 30, h: 380 },
      { x: 650, y: 220, w: 30, h: 380 },
    ],
    hazards: [{ x: 250, y: 380, w: 100, h: 60 }],
  },
  {
    name: "Nivel 2",
    start: { x: 60, y: 60 },
    goal: { x: 920, y: 520, r: 28 },
    walls: [
      { x: 0, y: 0, w: WORLD_WIDTH, h: 20 },
      { x: 0, y: WORLD_HEIGHT - 20, w: WORLD_WIDTH, h: 20 },
      { x: 0, y: 0, w: 20, h: WORLD_HEIGHT },
      { x: WORLD_WIDTH - 20, y: 0, w: 20, h: WORLD_HEIGHT },
      { x: 200, y: 120, w: 30, h: 300 },
      { x: 400, y: 180, w: 30, h: 420 },
      { x: 600, y: 0, w: 30, h: 340 },
      { x: 800, y: 120, w: 30, h: 300 },
    ],
    hazards: [
      { x: 300, y: 460, w: 90, h: 60 },
      { x: 650, y: 380, w: 90, h: 60 },
    ],
  },
  {
    name: "Nivel 3",
    start: { x: 500, y: 60 },
    goal: { x: 60, y: 540, r: 26 },
    walls: [
      { x: 0, y: 0, w: WORLD_WIDTH, h: 20 },
      { x: 0, y: WORLD_HEIGHT - 20, w: WORLD_WIDTH, h: 20 },
      { x: 0, y: 0, w: 20, h: WORLD_HEIGHT },
      { x: WORLD_WIDTH - 20, y: 0, w: 20, h: WORLD_HEIGHT },
      { x: 150, y: 150, w: 400, h: 26 },
      { x: 450, y: 300, w: 400, h: 26 },
      { x: 150, y: 420, w: 400, h: 26 },
    ],
    hazards: [
      { x: 100, y: 250, w: 60, h: 60 },
      { x: 840, y: 450, w: 60, h: 60 },
    ],
  },
];

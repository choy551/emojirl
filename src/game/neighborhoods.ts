/** A grid beside the origin city. `faces` is the side that looks back at its parent. */
export interface Neighborhood {
  id: string;
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  faces: 'north' | 'south' | 'east' | 'west' | null;
  tiles: (string | null)[];
  decor: boolean[];
  passOverride: (boolean | null)[];
  blockedTypes: string[];
}

export const NEIGHBORHOOD_COST = 20;
export const ORIGIN_ID = 'origin';

type Edge = NonNullable<Neighborhood['faces']>;

export interface HoodCity {
  cols: number;
  rows: number;
  tiles: (string | null)[];
  decor: boolean[];
  passOverride: (boolean | null)[];
  blockedTypes: string[];
  neighborhoods?: Neighborhood[];
}

export function originHood(city: HoodCity): Neighborhood {
  return {
    id: ORIGIN_ID,
    ox: 0,
    oy: 0,
    cols: city.cols,
    rows: city.rows,
    faces: null,
    tiles: city.tiles,
    decor: city.decor,
    passOverride: city.passOverride,
    blockedTypes: city.blockedTypes,
  };
}

export function extraHoods(city: HoodCity): Neighborhood[] {
  return (city.neighborhoods ?? []).filter(hood => hood.id !== ORIGIN_ID);
}

export function allHoods(city: HoodCity): Neighborhood[] {
  return [originHood(city), ...extraHoods(city)];
}

export function hoodAt(city: HoodCity, x: number, y: number): { hood: Neighborhood; index: number } | null {
  for (const hood of allHoods(city)) {
    const lx = x - hood.ox;
    const ly = y - hood.oy;
    if (lx < 0 || ly < 0 || lx >= hood.cols || ly >= hood.rows) continue;
    return { hood, index: ly * hood.cols + lx };
  }
  return null;
}

export function hoodById(city: HoodCity, id: string): Neighborhood | null {
  if (id === ORIGIN_ID) return originHood(city);
  return extraHoods(city).find(hood => hood.id === id) ?? null;
}

function rect(hood: Neighborhood): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: hood.ox, y0: hood.oy, x1: hood.ox + hood.cols, y1: hood.oy + hood.rows };
}

export function hoodsOverlap(a: Neighborhood, b: Neighborhood): boolean {
  const left = rect(a);
  const right = rect(b);
  return left.x0 < right.x1 && right.x0 < left.x1 && left.y0 < right.y1 && right.y0 < left.y1;
}

export function canGrowEdge(hood: Neighborhood, edge: Edge): boolean {
  return hood.faces !== edge;
}

export function hoodIsMaxed(hood: Neighborhood, max: number): boolean {
  return hood.cols >= max && hood.rows >= max;
}

/** Where an 8×8 child would sit, flush with the parent's outer corner. */
export function childRect(parent: Neighborhood, edge: Edge, span = 8): Neighborhood {
  const faces = opposite(edge);
  if (edge === 'east') return blank(parent.ox + parent.cols, parent.oy, span, span, faces);
  if (edge === 'west') return blank(parent.ox - span, parent.oy, span, span, faces);
  if (edge === 'south') return blank(parent.ox, parent.oy + parent.rows, span, span, faces);
  return blank(parent.ox, parent.oy - span, span, span, faces);
}

export function grownRect(hood: Neighborhood, edge: Edge): Neighborhood {
  if (edge === 'east') return { ...hood, cols: hood.cols + 1 };
  if (edge === 'west') return { ...hood, ox: hood.ox - 1, cols: hood.cols + 1 };
  if (edge === 'south') return { ...hood, rows: hood.rows + 1 };
  return { ...hood, oy: hood.oy - 1, rows: hood.rows + 1 };
}

export function growthBlocked(city: HoodCity, hood: Neighborhood, edge: Edge): boolean {
  const next = grownRect(hood, edge);
  return allHoods(city).some(other => other.id !== hood.id && hoodsOverlap(next, other));
}

export function spawnBlocked(city: HoodCity, parent: Neighborhood, edge: Edge): boolean {
  const child = childRect(parent, edge);
  return allHoods(city).some(other => hoodsOverlap(child, other));
}

function opposite(edge: Edge): Edge {
  if (edge === 'east') return 'west';
  if (edge === 'west') return 'east';
  if (edge === 'north') return 'south';
  return 'north';
}

function blank(ox: number, oy: number, cols: number, rows: number, faces: Edge): Neighborhood {
  const size = cols * rows;
  return {
    id: '',
    ox,
    oy,
    cols,
    rows,
    faces,
    tiles: Array.from({ length: size }, () => null),
    decor: Array.from({ length: size }, () => false),
    passOverride: Array.from({ length: size }, () => null),
    blockedTypes: [],
  };
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function worldBounds(city: HoodCity): WorldBounds {
  const hoods = allHoods(city);
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const hood of hoods) {
    minX = Math.min(minX, hood.ox);
    minY = Math.min(minY, hood.oy);
    maxX = Math.max(maxX, hood.ox + hood.cols);
    maxY = Math.max(maxY, hood.oy + hood.rows);
  }
  return { minX, minY, maxX, maxY };
}

/** Palette + run-length form stored in a shared city. Older grids omit `compact`. */
export interface CompactCity {
  compact: 1;
  nextId: number;
  citizens: { id: string; emoji: string; x: number; y: number }[];
  hoods: CompactHood[];
}

interface CompactHood {
  id: string;
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  faces: Neighborhood['faces'];
  palette: string[];
  tiles: string;
  decor?: string;
  pass?: string;
  blocked?: string[];
}

export function isCompactCity(raw: unknown): raw is CompactCity {
  return !!raw && typeof raw === 'object' && (raw as CompactCity).compact === 1 && Array.isArray((raw as CompactCity).hoods);
}

export function compactCity(city: HoodCity & { citizens: CompactCity['citizens']; nextId: number }): CompactCity {
  return {
    compact: 1,
    nextId: city.nextId,
    citizens: city.citizens.map(citizen => ({ id: citizen.id, emoji: citizen.emoji, x: citizen.x, y: citizen.y })),
    hoods: allHoods(city).map(compactHood),
  };
}

function compactHood(hood: Neighborhood): CompactHood {
  const palette: string[] = [];
  const indexes = hood.tiles.map(cell => {
    if (!cell) return 0;
    let at = palette.indexOf(cell);
    if (at < 0) {
      palette.push(cell);
      at = palette.length - 1;
    }
    return at + 1;
  });
  const packed: CompactHood = {
    id: hood.id,
    ox: hood.ox,
    oy: hood.oy,
    cols: hood.cols,
    rows: hood.rows,
    faces: hood.faces,
    palette,
    tiles: rle(indexes),
  };
  if (hood.decor.some(Boolean)) packed.decor = rle(hood.decor.map(flag => flag ? 1 : 0));
  if (hood.passOverride.some(flag => flag !== null)) {
    packed.pass = rle(hood.passOverride.map(flag => flag === true ? 1 : flag === false ? 2 : 0));
  }
  if (hood.blockedTypes.length > 0) packed.blocked = [...hood.blockedTypes];
  return packed;
}

export function expandCompactHoods(raw: CompactCity): { hoods: Neighborhood[]; citizens: CompactCity['citizens']; nextId: number } {
  const hoods = raw.hoods.map(expandHood).filter((hood): hood is Neighborhood => hood !== null);
  return {
    hoods,
    citizens: Array.isArray(raw.citizens) ? raw.citizens : [],
    nextId: typeof raw.nextId === 'number' ? raw.nextId : 1,
  };
}

function expandHood(raw: CompactHood): Neighborhood | null {
  if (!raw || typeof raw !== 'object') return null;
  const cols = Math.floor(raw.cols);
  const rows = Math.floor(raw.rows);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return null;
  const size = cols * rows;
  const palette = Array.isArray(raw.palette) ? raw.palette.filter((cell): cell is string => typeof cell === 'string') : [];
  const indexes = unrle(typeof raw.tiles === 'string' ? raw.tiles : '', size);
  const tiles = indexes.map(index => index <= 0 ? null : palette[index - 1] ?? null);
  const decor = raw.decor ? unrle(raw.decor, size).map(flag => flag === 1) : Array.from({ length: size }, () => false);
  const passOverride = raw.pass
    ? unrle(raw.pass, size).map(flag => flag === 1 ? true : flag === 2 ? false : null)
    : Array.from({ length: size }, () => null as boolean | null);
  const faces = raw.faces === 'north' || raw.faces === 'south' || raw.faces === 'east' || raw.faces === 'west' ? raw.faces : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : 'hood',
    ox: Math.floor(raw.ox) || 0,
    oy: Math.floor(raw.oy) || 0,
    cols,
    rows,
    faces: raw.id === ORIGIN_ID ? null : faces,
    tiles,
    decor,
    passOverride,
    blockedTypes: Array.isArray(raw.blocked) ? raw.blocked.filter((cell): cell is string => typeof cell === 'string') : [],
  };
}

function rle(values: number[]): string {
  if (values.length === 0) return '';
  const parts: string[] = [];
  let current = values[0]!;
  let count = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] === current) count += 1;
    else {
      parts.push(`${count}*${current}`);
      current = values[i]!;
      count = 1;
    }
  }
  parts.push(`${count}*${current}`);
  return parts.join(',');
}

function unrle(packed: string, size: number): number[] {
  const out: number[] = [];
  if (packed) {
    for (const part of packed.split(',')) {
      const [countRaw, valueRaw] = part.split('*');
      const count = Math.max(0, Math.floor(Number(countRaw)));
      const value = Math.floor(Number(valueRaw));
      for (let i = 0; i < count && out.length < size; i++) out.push(Number.isFinite(value) ? value : 0);
    }
  }
  while (out.length < size) out.push(0);
  return out;
}

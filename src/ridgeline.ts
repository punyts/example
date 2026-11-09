/**
 * Ridgeline, a two-player board game on a 5 × 5 ridge, played in the 3D scene of the Ridgeline section. The rules live
 * here as pure functions over a JSON game state; the app registers three of them as logic expression functions
 * (`ridgelineNew`, `ridgelinePick`, `ridgelineMove`) and the document's rules call them when a piece or a tile is
 * pressed. The state carries what the scene shows: each piece's position, the tile colours, the halo under the picked
 * piece and the counts.
 *
 * The rules:
 * - Amber and Teal each have a Warden and four Scouts. They start on their home row (Amber on row 1, Teal on row 5):
 *   Scouts on columns a, b, d and e, the Warden on column c, its side's Beacon. Amber moves first.
 * - A turn moves one of your pieces one step to an empty tile. A Scout steps straight (forward, back or sideways); a
 *   Warden steps in any of the eight directions. Scouts may not enter either Beacon.
 * - Flanking: after your move, an enemy Scout next to the piece you moved, with one of your pieces right behind it on
 *   the same straight line, is captured and leaves the board. Only the mover captures: stepping between two enemies is
 *   safe. Wardens are never captured, but they flank like Scouts.
 * - You win when your Warden stands on the enemy Beacon, when the enemy has no Scouts left, or when the enemy has no
 *   move on its turn. After 60 moves the side with more Scouts wins; equal Scouts is a draw.
 */
import type { JsonValue } from '@punyts/stateui-app';

export type Side = 'amber' | 'teal';
export type Kind = 'warden' | 'scout';
export type Winner = Side | 'draw' | 'none';

/** The board is `SIZE` × `SIZE` tiles */
export const SIZE = 5;
/** After this many moves the game ends: more Scouts wins, equal Scouts is a draw */
export const MOVE_LIMIT = 60;

export interface Piece {
    id: string;
    side: Side;
    kind: Kind;
    col: number;
    row: number;
    alive: boolean;
    /** Where the scene draws it: on its tile, or in its side's tray once captured */
    at: [number, number, number];
}

export interface Tile {
    id: string;
    /** The tile's name in board notation, `a1` to `e5` */
    name: string;
    at: [number, number, number];
    /** Its material: copies of one repeat3d mesh may differ only in colour */
    paint: { color: string };
}

export interface RidgelineState {
    turn: Side;
    winner: Winner;
    /** How the game was won: `beacon`, `scouts`, `stuck` or `limit`; empty while it runs */
    reason: '' | 'beacon' | 'scouts' | 'stuck' | 'limit';
    /** The id of the picked piece; empty when none is */
    picked: string;
    moves: number;
    /** The last move in board notation (`b1-b2`, `x` marking a capture); empty before the first */
    last: string;
    pieces: Record<string, Piece>;
    tiles: Record<string, Tile>;
    halo: { at: [number, number, number]; visible: boolean };
    /** Scouts left per side, for the counters */
    scouts: Record<Side, number>;
}

/** Height of a tile's top face: pieces stand on it */
const TILE_TOP = 0.06;
const COLUMNS = 'abcde';
const COLORS = {
    light: '#eadcc2',
    dark: '#9e7c52',
    legal: '#45b860',
    picked: '#6fb1ff',
    beacon: { amber: '#f0a73a', teal: '#35bfae' }
} as const;

const HOME_ROW: Record<Side, number> = { amber: 0, teal: SIZE - 1 };
const BEACON_COL = 2;

const tileId = (col: number, row: number): string => `t${col}${row}`;
const tileName = (col: number, row: number): string => `${COLUMNS[col]}${row + 1}`;
const onBoard = (col: number, row: number): boolean => col >= 0 && col < SIZE && row >= 0 && row < SIZE;
const other = (side: Side): Side => (side === 'amber' ? 'teal' : 'amber');
const isBeacon = (col: number, row: number): Side | undefined =>
    col !== BEACON_COL ? undefined : row === HOME_ROW.amber ? 'amber' : row === HOME_ROW.teal ? 'teal' : undefined;

/** Scene position of a tile's centre: column a at the left, row 1 nearest the camera */
function place(col: number, row: number): [number, number, number] {
    return [col - (SIZE - 1) / 2, TILE_TOP, (SIZE - 1) / 2 - row];
}

/** Scene position of the `index`th captured Scout of `side`, in the tray beside the board */
function tray(side: Side, index: number): [number, number, number] {
    return [side === 'amber' ? -3.45 : 3.45, TILE_TOP, 1.35 - index * 0.9];
}

const STEPS_STRAIGHT: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEPS_ALL: readonly [number, number][] = [...STEPS_STRAIGHT, [1, 1], [1, -1], [-1, 1], [-1, -1]];

function pieceAt(state: RidgelineState, col: number, row: number): Piece | undefined {
    return Object.values(state.pieces).find((piece) => piece.alive && piece.col === col && piece.row === row);
}

/** The tiles a piece can step to, as `[col, row]` */
export function legalTargets(state: RidgelineState, id: string): [number, number][] {
    const piece = state.pieces[id];
    if (!piece || !piece.alive) return [];
    const steps = piece.kind === 'warden' ? STEPS_ALL : STEPS_STRAIGHT;
    const out: [number, number][] = [];
    for (const [dc, dr] of steps) {
        const col = piece.col + dc;
        const row = piece.row + dr;
        if (!onBoard(col, row) || pieceAt(state, col, row)) continue;
        if (piece.kind === 'scout' && isBeacon(col, row)) continue;
        out.push([col, row]);
    }
    return out;
}

function hasMove(state: RidgelineState, side: Side): boolean {
    return Object.values(state.pieces).some((piece) => piece.side === side && legalTargets(state, piece.id).length > 0);
}

function scoutsLeft(state: RidgelineState, side: Side): number {
    return Object.values(state.pieces).filter((piece) => piece.side === side && piece.kind === 'scout' && piece.alive).length;
}

/** Recolours the tiles, places the halo and recounts: everything the scene shows that follows from the rest */
function dress(state: RidgelineState): RidgelineState {
    const targets = new Set(state.picked === '' ? [] : legalTargets(state, state.picked).map(([col, row]) => tileId(col, row)));
    const picked = state.picked === '' ? undefined : state.pieces[state.picked];
    for (const tile of Object.values(state.tiles)) {
        const col = Number(tile.id[1]);
        const row = Number(tile.id[2]);
        const beacon = isBeacon(col, row);
        const base = beacon ? COLORS.beacon[beacon] : (col + row) % 2 === 0 ? COLORS.dark : COLORS.light;
        const color = targets.has(tile.id) ? COLORS.legal : picked && picked.col === col && picked.row === row ? COLORS.picked : base;
        tile.paint = { color };
    }
    state.halo = picked ? { at: [picked.at[0], TILE_TOP + 0.02, picked.at[2]], visible: true } : { at: [0, TILE_TOP, 0], visible: false };
    state.scouts = { amber: scoutsLeft(state, 'amber'), teal: scoutsLeft(state, 'teal') };
    return state;
}

/** A new game, Amber to move */
export function newGame(): RidgelineState {
    const pieces: Record<string, Piece> = {};
    for (const side of ['amber', 'teal'] as const) {
        const prefix = side === 'amber' ? 'a' : 't';
        const row = HOME_ROW[side];
        pieces[`${prefix}W`] = { id: `${prefix}W`, side, kind: 'warden', col: BEACON_COL, row, alive: true, at: place(BEACON_COL, row) };
        [0, 1, 3, 4].forEach((col, index) => {
            const id = `${prefix}${index + 1}`;
            pieces[id] = { id, side, kind: 'scout', col, row, alive: true, at: place(col, row) };
        });
    }
    const tiles: Record<string, Tile> = {};
    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            const id = tileId(col, row);
            const [x, , z] = place(col, row);
            tiles[id] = { id, name: tileName(col, row), at: [x, 0, z], paint: { color: COLORS.light } };
        }
    }
    return dress({ turn: 'amber', winner: 'none', reason: '', picked: '', moves: 0, last: '', pieces, tiles, halo: { at: [0, 0, 0], visible: false }, scouts: { amber: 4, teal: 4 } });
}

const clone = (state: RidgelineState): RidgelineState => JSON.parse(JSON.stringify(state)) as RidgelineState;

function isState(value: unknown): value is RidgelineState {
    return typeof value === 'object' && value !== null && 'pieces' in value && 'tiles' in value && 'turn' in value;
}

/**
 * Picks the piece `id` for the side to move, or drops the pick when it is the picked piece. Anything else (an enemy
 * piece, a captured one, a finished game) leaves the state as it is
 */
export function pick(state: RidgelineState, id: string): RidgelineState {
    const piece = state.pieces[id];
    if (state.winner !== 'none' || !piece || !piece.alive || piece.side !== state.turn) return state;
    const next = clone(state);
    next.picked = state.picked === id ? '' : id;
    return dress(next);
}

/**
 * Moves the picked piece to the tile `id` when that is a legal step, captures the Scouts it flanks, decides the game
 * and passes the turn. A tile the picked piece cannot reach drops the pick; with nothing picked nothing changes
 */
export function move(state: RidgelineState, id: string): RidgelineState {
    if (state.winner !== 'none' || state.picked === '' || !state.tiles[id]) return state;
    const col = Number(id[1]);
    const row = Number(id[2]);
    const next = clone(state);
    const piece = next.pieces[state.picked] as Piece;
    if (!legalTargets(state, piece.id).some(([c, r]) => c === col && r === row)) {
        next.picked = '';
        return dress(next);
    }
    const from = tileName(piece.col, piece.row);
    piece.col = col;
    piece.row = row;
    piece.at = place(col, row);
    // Flanking: an enemy Scout next to the mover with a friend right behind it
    let captures = 0;
    for (const [dc, dr] of STEPS_STRAIGHT) {
        const victim = pieceAt(next, col + dc, row + dr);
        const partner = pieceAt(next, col + 2 * dc, row + 2 * dr);
        if (victim && victim.side !== piece.side && victim.kind === 'scout' && partner && partner.side === piece.side) {
            victim.alive = false;
            victim.at = tray(victim.side, 4 - scoutsLeft(next, victim.side) - 1);
            captures += 1;
        }
    }
    next.moves += 1;
    next.last = `${from}${captures > 0 ? 'x' : '-'}${tileName(col, row)}`;
    next.picked = '';
    const enemy = other(piece.side);
    if (piece.kind === 'warden' && isBeacon(col, row) === enemy) {
        next.winner = piece.side;
        next.reason = 'beacon';
    } else if (scoutsLeft(next, enemy) === 0) {
        next.winner = piece.side;
        next.reason = 'scouts';
    } else if (!hasMove(next, enemy)) {
        next.winner = piece.side;
        next.reason = 'stuck';
    } else if (next.moves >= MOVE_LIMIT) {
        const mine = scoutsLeft(next, piece.side);
        const theirs = scoutsLeft(next, enemy);
        next.winner = mine === theirs ? 'draw' : mine > theirs ? piece.side : enemy;
        next.reason = 'limit';
    }
    if (next.winner === 'none') next.turn = enemy;
    return dress(next);
}

/** The game rules as logic expression functions, for `mountApp`'s `logicFunctions.expressions` */
export const RIDGELINE_FUNCTIONS = {
    /** A new game when `ask` is `true` (the New game button); the rule that calls it writes `false` back, which keeps the game */
    ridgelineNew: (state: JsonValue, ask: JsonValue): JsonValue => (ask === true ? (newGame() as unknown as JsonValue) : state),
    ridgelinePick: (state: JsonValue, id: JsonValue): JsonValue =>
        (isState(state) && typeof id === 'string' && id !== '' ? pick(state, id) : state) as unknown as JsonValue,
    ridgelineMove: (state: JsonValue, id: JsonValue): JsonValue =>
        (isState(state) && typeof id === 'string' && id !== '' ? move(state, id) : state) as unknown as JsonValue
} as const;

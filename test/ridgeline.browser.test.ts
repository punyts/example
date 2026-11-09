/**
 * The rules of Ridgeline (`src/ridgeline.ts`): start position, legal steps, flanking captures, the three ways to win and
 * the move limit. Pure functions, so these tests build positions by hand
 */
import { describe, expect, it } from 'vitest';
import { MOVE_LIMIT, RIDGELINE_FUNCTIONS, legalTargets, move, newGame, pick } from '../src/ridgeline.ts';
import type { RidgelineState } from '../src/ridgeline.ts';

/** Plays `[piece, tile]` moves in order, picking each piece first */
function play(state: RidgelineState, moves: readonly [string, string][]): RidgelineState {
    return moves.reduce((current, [piece, tile]) => move(pick(current, piece), tile), state);
}

/** Puts a piece on a tile directly, for positions the tests set up */
function put(state: RidgelineState, id: string, col: number, row: number): RidgelineState {
    const next = JSON.parse(JSON.stringify(state)) as RidgelineState;
    const piece = next.pieces[id];
    if (!piece) throw new Error(`no piece ${id}`);
    piece.col = col;
    piece.row = row;
    return next;
}

const names = (targets: [number, number][]): string[] => targets.map(([col, row]) => `${'abcde'[col]}${row + 1}`).sort();

describe('Ridgeline rules', () => {
    it('should start with five pieces a side on the home rows, Amber to move', () => {
        // Act
        const game = newGame();

        // Assert
        expect(game.turn).toBe('amber');
        expect(game.winner).toBe('none');
        expect(Object.keys(game.pieces)).toEqual(['aW', 'a1', 'a2', 'a3', 'a4', 'tW', 't1', 't2', 't3', 't4']);
        expect(Object.keys(game.tiles)).toHaveLength(25);
        expect(game.pieces['aW']).toMatchObject({ kind: 'warden', col: 2, row: 0, at: [0, 0.06, 2] });
        expect(game.pieces['t4']).toMatchObject({ kind: 'scout', col: 4, row: 4, at: [2, 0.06, -2] });
        expect(game.scouts).toEqual({ amber: 4, teal: 4 });
    });

    it('should step a Scout straight and a Warden any way, never onto a piece or a Scout onto a Beacon', () => {
        // Arrange
        const game = put(newGame(), 'a2', 1, 1);

        // Act
        const scout = names(legalTargets(game, 'a2'));
        const warden = names(legalTargets(game, 'aW'));
        const besideBeacon = names(legalTargets(put(game, 'a1', 1, 0), 'a1'));

        // Assert
        expect(scout).toEqual(['a2', 'b1', 'b3', 'c2']);
        expect(warden).toEqual(['b1', 'c2', 'd2']);
        expect(besideBeacon).toEqual(['a1']);
    });

    it('should pick only a piece of the side to move, and drop the pick when it is pressed again', () => {
        const game = newGame();

        expect(pick(game, 't1').picked).toBe('');
        expect(pick(game, 'a1').picked).toBe('a1');
        expect(pick(pick(game, 'a1'), 'a1').picked).toBe('');
    });

    it('should colour the legal tiles of the picked piece and show the halo under it', () => {
        // Act
        const game = pick(newGame(), 'a1');

        // Assert
        expect(game.tiles['t01']?.paint.color).toBe('#45b860');
        expect(game.tiles['t00']?.paint.color).toBe('#6fb1ff');
        expect(game.tiles['t44']?.paint.color).not.toBe('#45b860');
        expect(game.halo).toEqual({ at: [-2, 0.08, 2], visible: true });
    });

    it('should move, write the notation and pass the turn; an unreachable tile only drops the pick', () => {
        // Act
        const moved = play(newGame(), [['a1', 't01']]);
        const missed = move(pick(newGame(), 'a1'), 't33');

        // Assert
        expect(moved.pieces['a1']).toMatchObject({ col: 0, row: 1, at: [-2, 0.06, 1] });
        expect(moved).toMatchObject({ turn: 'teal', moves: 1, last: 'a1-a2', picked: '' });
        expect(missed).toMatchObject({ turn: 'amber', moves: 0, picked: '' });
        expect(missed.pieces['a1']).toMatchObject({ col: 0, row: 0 });
    });

    it('should capture an enemy Scout the mover flanks and move it to its tray', () => {
        // Arrange: Teal scout t2 on b3, Amber scout a2 on b2; Amber scout a1 steps to b4 from a4
        let game = put(put(put(newGame(), 't2', 1, 2), 'a2', 1, 1), 'a1', 0, 3);

        // Act
        game = play(game, [['a1', 't13']]);

        // Assert
        expect(game.pieces['t2']).toMatchObject({ alive: false, at: [3.45, 0.06, 1.35] });
        expect(game.last).toBe('a4xb4');
        expect(game.scouts).toEqual({ amber: 4, teal: 3 });
    });

    it('should not capture a piece that steps between two enemies', () => {
        // Arrange: Amber scouts on a3 and c3, Teal scout t2 steps from b4 to b3... between them on the row
        let game = put(put(put(newGame(), 'a1', 0, 2), 'a2', 2, 2), 't2', 1, 3);
        game = { ...game, turn: 'teal' };

        // Act
        game = play(game, [['t2', 't12']]);

        // Assert
        expect(game.pieces['t2']).toMatchObject({ alive: true, col: 1, row: 2 });
        expect(game.turn).toBe('amber');
    });

    it('should win when a Warden reaches the enemy Beacon', () => {
        // Arrange: the Teal Warden has left its Beacon, the Amber Warden stands next to it
        let game = put(put(newGame(), 'tW', 3, 3), 'aW', 2, 3);

        // Act
        game = play(game, [['aW', 't24']]);

        // Assert
        expect(game).toMatchObject({ winner: 'amber', reason: 'beacon', turn: 'amber' });
        expect(pick(game, 'aW')).toBe(game);
    });

    it('should win when the enemy has no Scouts left', () => {
        // Arrange: three Teal Scouts are already captured, the last one stands on b3 flanked from b2
        let game = newGame();
        for (const id of ['t1', 't3', 't4']) (game.pieces[id] as { alive: boolean }).alive = false;
        game = put(put(put(game, 't2', 1, 2), 'a2', 1, 1), 'a1', 0, 3);

        // Act
        game = play(game, [['a1', 't13']]);

        // Assert
        expect(game).toMatchObject({ winner: 'amber', reason: 'scouts' });
    });

    it('should decide by Scouts at the move limit, a draw when they are equal', () => {
        // Arrange
        const game = { ...newGame(), moves: MOVE_LIMIT - 1 };

        // Act
        const ended = play(game, [['a1', 't01']]);

        // Assert
        expect(ended).toMatchObject({ winner: 'draw', reason: 'limit' });
    });

    it('should leave the state alone for anything the logic passes that is not a piece or a tile', () => {
        const game = RIDGELINE_FUNCTIONS.ridgelineNew(null, true);

        expect(RIDGELINE_FUNCTIONS.ridgelineNew(game, false)).toBe(game);
        expect(RIDGELINE_FUNCTIONS.ridgelinePick(game, '')).toBe(game);
        expect(RIDGELINE_FUNCTIONS.ridgelineMove(game, 't01')).toBe(game);
        expect(RIDGELINE_FUNCTIONS.ridgelineMove(null, 't01')).toBe(null);
    });
});

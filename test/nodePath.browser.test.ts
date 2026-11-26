/**
 * The pure id lookup of `src/nodePath.ts`, which the code that writes a node's own state uses to find the node
 */
import { describe, expect, it } from 'vitest';
import { pathOfId, requirePathOfId } from '../src/nodePath.ts';
import { sectionPaths } from '../src/sections.ts';

const tree = {
    component: 'panel',
    children: {
        nav: { component: 'nav', children: { home: { component: 'menuItem' }, about: { component: 'menuItem' } } },
        first: { component: 'panel', '@id': 'homeSection', children: { note: { component: 'text' } } },
        second: {
            component: 'dialog',
            '@id': 'aboutSection',
            footer: { component: 'toolbar', children: { close: { component: 'button', '@id': 'done' }, note: { component: 'text' } } }
        }
    }
};

describe('pathOfId', () => {
    it('should find a node by its @id, in children and in slots', () => {
        // Arrange and Act
        const section = pathOfId(tree, '$.screens.main', 'homeSection');
        const button = pathOfId(tree, '$.screens.main', 'done');

        // Assert
        expect(section).toBe('$.screens.main.children.first');
        expect(button).toBe('$.screens.main.children.second.footer.children.close');
    });

    it('should name a node without an @id by its key, and not by its key when it has one', () => {
        // Arrange and Act
        const byKey = pathOfId(tree, '$.screens.main', 'nav');
        const keyOfNamed = pathOfId(tree, '$.screens.main', 'first');
        const root = pathOfId(tree, '$.screens.main', 'main');

        // Assert
        expect(byKey).toBe('$.screens.main.children.nav');
        expect(keyOfNamed).toBeUndefined();
        expect(root).toBe('$.screens.main');
    });

    it('should find nothing for an id no node has, an id two nodes have, or a root that is not a node', () => {
        // Arrange and Act
        const missing = pathOfId(tree, '$.screens.main', 'nowhere');
        const twice = pathOfId(tree, '$.screens.main', 'note');
        const notNode = pathOfId({ children: {} }, '$.screens.main', 'nav');

        // Assert
        expect(missing).toBeUndefined();
        expect(twice).toBeUndefined();
        expect(notNode).toBeUndefined();
        expect(() => requirePathOfId(tree, '$.screens.main', 'note')).toThrow('"note"');
    });
});

describe('sectionPaths', () => {
    it('should give the path of each nav item\'s panel, found by its id, in the nav\'s order', () => {
        // Arrange and Act
        const paths = sectionPaths(tree);

        // Assert
        expect(Object.entries(paths)).toEqual([
            ['home', '$.screens.main.children.first'],
            ['about', '$.screens.main.children.second']
        ]);
    });

    it('should throw when a nav item has no panel', () => {
        // Arrange
        const broken = { ...tree, children: { ...tree.children, first: { component: 'panel' } } };

        // Act and Assert
        expect(() => sectionPaths(broken)).toThrow('"homeSection"');
    });
});

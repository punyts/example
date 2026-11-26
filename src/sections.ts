/**
 * The sections of the app. `$.data.nav.section` is the one value that says which section is shown: the nav's `active`
 * is linked to it, and the links in the document, the agent console, the breadcrumb handler and the tests write it.
 * Whether a section's panel is hidden is the panel's own state, so it is kept on the node (`hidden`), not in `$.data`.
 * Only `bindSections` writes it, from the section: each panel is found by its `@id` (`<section>Section`) and its
 * `hidden` is protected, so a write to it anywhere else is refused and the nav and the panels cannot disagree
 */
import type { Store } from '@punyts/state';
import type { AppState } from '@punyts/stateui-app';
import { requirePathOfId } from './nodePath.ts';

const SECTION = '$.data.nav.section';

/** The state path of the screen the sections are in */
export const SECTIONS_SCREEN = '$.screens.main';

/** The `@id` of a section's panel */
export const sectionId = (name: string): string => `${name}Section`;

/**
 * The state path of each section's panel by section name, in the nav's order. The items of the nav (the node with the
 * id `nav`) name the sections, so a new section needs no code here. `root` is the root node of the screen at
 * `rootPath`. Throws when there is no nav or an item of it has no panel
 */
export function sectionPaths(root: unknown, rootPath: string = SECTIONS_SCREEN): Record<string, string> {
    const nav = requirePathOfId(root, rootPath, 'nav');
    let node: unknown = root;
    for (const step of nav.slice(rootPath.length + 1).split('.')) node = (node as Record<string, unknown>)[step];
    const items = (node as { children?: Record<string, unknown> }).children ?? {};
    return Object.fromEntries(Object.keys(items).map((name) => [name, requirePathOfId(root, rootPath, sectionId(name))]));
}

/** Shows one section: writes the section, which the nav and the panels follow */
export function showSection(store: Store<AppState>, name: string): void {
    store.set(SECTION, name);
}

/**
 * Writes each panel's `hidden` from the section now and on every change of it, and protects it. `paths` is the result
 * of `sectionPaths`. A section that is not one of the names is put back to the one shown. Returns the function that
 * stops it
 */
export function bindSections(store: Store<AppState>, paths: Readonly<Record<string, string>>): () => void {
    const flags = Object.entries(paths).map(([name, path]) => [name, `${path}.hidden`] as const);
    let shown = '';
    const apply = (): void => {
        const name = store.get<string>(SECTION);
        if (!Object.hasOwn(paths, name)) {
            if (shown !== '') store.set(SECTION, shown);
            return;
        }
        shown = name;
        for (const [section, flag] of flags) {
            if (store.get<boolean>(flag) === (section !== name)) continue;
            store.unprotect(flag);
            store.set(flag, section !== name);
            store.protect(flag);
        }
    };
    for (const [, flag] of flags) store.protect(flag);
    store.on(SECTION, apply);
    apply();
    return () => {
        store.off(SECTION, apply);
        for (const [, flag] of flags) store.unprotect(flag);
    };
}

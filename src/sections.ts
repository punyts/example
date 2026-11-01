/**
 * The sections of the app. `$.data.view.section` is the one value that says which section is shown: the nav's `active`
 * is linked to it, and the links in the document, the agent console, the breadcrumb handler and the tests write it.
 * Each section panel's `hidden` is linked to a flag under `$.data.view.hidden`, which only `bindSections` writes, from
 * the section; the flags are protected, so a write to them anywhere else is refused and the nav and the panels can't
 * disagree
 */
import type { Store } from '@punyts/state';
import type { AppState } from '@punyts/stateui-app';

const SECTION = '$.data.view.section';
const HIDDEN = '$.data.view.hidden';

/** The section names, read from the hidden flags of the app's data so a new section needs no code here */
export function sectionNames(store: Store<AppState>): string[] {
    return Object.keys(store.get<Record<string, boolean>>(HIDDEN));
}

/** Shows one section: writes the section, which the nav and the panels follow */
export function showSection(store: Store<AppState>, name: string): void {
    store.set(SECTION, name);
}

/**
 * Derives the hidden flags from the section now and on every change of it, and protects them. A section that is not
 * one of the names is put back to the one shown. Returns the function that stops it
 */
export function bindSections(store: Store<AppState>): () => void {
    let shown = '';
    const apply = (): void => {
        const name = store.get<string>(SECTION);
        const names = sectionNames(store);
        if (!names.includes(name)) {
            if (shown !== '') store.set(SECTION, shown);
            return;
        }
        shown = name;
        store.unprotect(HIDDEN);
        for (const section of names) {
            if (store.get<boolean>(`${HIDDEN}.${section}`) !== (section !== name)) store.set(`${HIDDEN}.${section}`, section !== name);
        }
        store.protect(HIDDEN);
    };
    store.on(SECTION, apply);
    apply();
    return () => {
        store.off(SECTION, apply);
        store.unprotect(HIDDEN);
    };
}

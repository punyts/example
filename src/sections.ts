/**
 * The sections of the app: one `$.data.view.hidden.<name>` flag per section panel, set by the nav items, the links in the
 * document and, through this helper, by the agent console, the breadcrumb handler and the tests
 */
import type { Store } from '@punyts/state';
import type { AppState } from '@punyts/stateui-app';

/** The section names, read from the hidden flags of the app's data so a new section needs no code here */
export function sectionNames(store: Store<AppState>): string[] {
    return Object.keys(store.get<Record<string, boolean>>('$.data.view.hidden'));
}

/** Shows one section and hides the others; the nav follows `$.data.view.section` */
export function showSection(store: Store<AppState>, name: string): void {
    store.set('$.data.view.section', name);
    for (const section of sectionNames(store)) store.set(`$.data.view.hidden.${section}`, section !== name);
}

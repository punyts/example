/**
 * Starts the Lumen desktop: opens the file store (OPFS), reads the saved items and preferences, mounts the desktop
 * document and connects what needs code:
 *
 * - **Placement.** A window's `placement` cannot be linked, so a bridge copies `$.data.desk.state.placement.<app>` (which
 *   `deskAct` derives) onto each window node.
 * - **Focus on press.** A panel raises no press event, so a pointer down anywhere in a window writes `focus <app>`.
 * - **Persistence.** The items and preferences are saved to `desk.json` a moment after they change.
 * - **Dark mode, the clock, sizes.** The dark switch sets the theme mode; a timer writes the clock; the desktop surface,
 *   the folder tree and the listing get their heights, which a document has no property for.
 */
import type { Store } from '@punyts/state';
import { libraryFromCatalog, mountApp, registerMountStep } from '@punyts/stateui-app';
import type { AppState, BuildError, LogicExpressionFunction } from '@punyts/stateui-app';
import catalog from '@punyts/stateui-components/catalog.json';
import { registerAll } from '@punyts/stateui-components/components';
import icons from '../icons.json';
import { RIDGELINE_FUNCTIONS } from '../ridgeline.ts';
import { load3d } from '../warehouse.ts';
import { APPS, DESK_FUNCTIONS } from './desk.ts';
import type { AppId, Placement } from './desk.ts';
import { DESK_PATHS, deskData, desktopDocument } from './document.ts';
import { openFileStore } from './files.ts';
import type { FileStore, FileStoreOptions } from './files.ts';

export interface RunningDesktop {
    store: Store<AppState>;
    files: FileStore;
    /** Validation warnings from `mountApp` and every `SUI-RUN` error reported while running */
    errors: BuildError[];
    /** The element rendered for the node at `path`, searching open shadow roots */
    elementAt(path: string): HTMLElement | undefined;
    /** Writes `desk.json` now instead of after the save delay */
    flush(): Promise<void>;
    dispose(): void;
}

export interface DesktopOptions extends FileStoreOptions {
    /** How long after a change the items are saved, in ms (300 by default) */
    saveDelay?: number;
    /** The height of the desktop surface (the viewport less the taskbar by default) */
    surfaceHeight?: string;
}

type PathElement = HTMLElement & { scope?: { basePath?: string } };

function findAt(root: ParentNode, path: string): PathElement | undefined {
    for (const element of Array.from(root.querySelectorAll('*')) as PathElement[]) {
        if (element.scope?.basePath === path && element.localName.startsWith('ui-')) return element;
        if (element.shadowRoot) {
            const inner = findAt(element.shadowRoot, path);
            if (inner) return inner;
        }
    }
    return undefined;
}

const clockText = (date: Date): string =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(date);

export async function startDesktop(host: HTMLElement, options: DesktopOptions = {}): Promise<RunningDesktop> {
    if (customElements.get('ui-button') === undefined) registerAll();
    const library = libraryFromCatalog(catalog as never);
    const errors: BuildError[] = [];
    const onError = (error: BuildError): void => {
        errors.push(error);
        console.error(`[lumen] ${error.code} ${error.message}${error.statePath ? ` at ${error.statePath}` : ''}`);
    };

    const files = await openFileStore(options);
    const saved = ((await files.loadMeta()) ?? {}) as NonNullable<Parameters<typeof deskData>[0]>;
    const document = desktopDocument(deskData(saved));

    const unregisterIcons = registerMountStep('lumen-icons', {
        start({ store }) {
            store.set('$.runtime.icons', icons as never);
        }
    });

    let store: Store<AppState> | undefined;
    const onEmit = (name: string, payload: unknown): void => {
        if (name === 'fs.open' && typeof payload === 'string' && store !== undefined) store.set('$.data.input.open', payload);
    };

    const mounted = mountApp(
        host,
        document,
        library,
        { onEmit, onError, transferFile: files.transferFile, readFile: files.readFile, load3d },
        { logicFunctions: { expressions: { ...(DESK_FUNCTIONS as unknown as Record<string, LogicExpressionFunction>), ...RIDGELINE_FUNCTIONS } } }
    );
    if (!mounted.store) {
        unregisterIcons();
        for (const error of mounted.errors) onError(error);
        throw new Error(`Lumen did not mount: ${mounted.errors.map((error) => error.code).join(', ')}`);
    }
    store = mounted.store;
    errors.push(...mounted.errors);
    const live = store;
    const elementAt = (path: string): HTMLElement | undefined => findAt(host, path);

    // Sizes a document cannot give
    const sizes: Record<string, string> = {
        [DESK_PATHS.surface]: options.surfaceHeight ?? 'calc(100dvh - 60px)',
        [DESK_PATHS.folderTree]: '260px',
        [DESK_PATHS.listing]: '260px'
    };
    for (const [path, height] of Object.entries(sizes)) {
        const element = elementAt(path);
        if (element) element.style.blockSize = height;
    }

    // Placement: copy each window's derived placement onto its node
    const written = new Map<AppId, string>();
    const place = (): void => {
        const all = live.get<Record<AppId, Placement>>('$.data.desk.state.placement');
        for (const app of APPS) {
            const placement = all?.[app];
            if (placement === undefined) continue;
            const text = JSON.stringify(placement);
            if (written.get(app) === text) continue;
            written.set(app, text);
            live.set(`${DESK_PATHS.window(app)}.placement` as never, { ...placement } as never);
        }
    };

    // Focus on press: a pointer down in a window that is not in front brings it forward
    const focusers: [HTMLElement, (event: Event) => void][] = [];
    for (const app of APPS) {
        const element = elementAt(DESK_PATHS.window(app));
        if (element === undefined) continue;
        const listener = (): void => {
            if (live.get('$.data.desk.state.active') !== app) live.set('$.data.input.desk', `focus ${app}`);
        };
        element.addEventListener('pointerdown', listener, { capture: true });
        focusers.push([element, listener]);
    }

    // Dark windows
    const applyDark = (): void => {
        const mode = live.get('$.data.desk.prefs.dark') === true ? 'dark' : 'light';
        if (live.get('$.theme.active.mode') !== mode) live.set('$.theme.active.mode', mode);
    };

    // Persistence: the items, the next id and the preferences
    const saveDelay = options.saveDelay ?? 300;
    let lastSaved = '';
    let pending: ReturnType<typeof setTimeout> | undefined;
    const snapshot = (): string =>
        JSON.stringify({ items: live.get('$.data.fs.items'), nextId: live.get('$.data.fs.nextId'), prefs: live.get('$.data.desk.prefs') });
    lastSaved = saved.items === undefined ? '' : snapshot();
    const save = async (): Promise<void> => {
        pending = undefined;
        const text = snapshot();
        if (text === lastSaved) return;
        lastSaved = text;
        try {
            await files.saveMeta(JSON.parse(text));
        } catch (error) {
            console.error('[lumen] the desktop could not be saved:', error);
        }
    };
    const scheduleSave = (): void => {
        if (pending !== undefined) clearTimeout(pending);
        pending = setTimeout(() => void save(), saveDelay);
    };

    const bridges: [string | string[], () => void][] = [
        [['$.data.desk.state', '$.data.desk.state.placement', '$.data.desk.state.$all'], place],
        [['$.data.desk.prefs', '$.data.desk.prefs.dark'], applyDark],
        [['$.data.fs', '$.data.fs.items', '$.data.fs.items.$all', '$.data.desk.prefs', '$.data.desk.prefs.$all'], scheduleSave]
    ];
    for (const [paths, listener] of bridges) live.on(paths as never, listener);

    place();
    applyDark();
    live.set('$.data.desk.storage', files.kind === 'opfs'
        ? "Your files are kept in this browser's private file system (OPFS), so they are still here after a reload."
        : 'This browser has no private file system for this page, so your files last until the page closes.');
    const tick = (): void => {
        live.set('$.data.desk.clock', clockText(new Date()));
    };
    tick();
    const clock = setInterval(tick, 15_000);

    let disposed = false;
    return {
        store: live,
        files,
        errors,
        elementAt,
        async flush() {
            if (pending !== undefined) clearTimeout(pending);
            await save();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            clearInterval(clock);
            if (pending !== undefined) clearTimeout(pending);
            for (const [paths, listener] of bridges) live.off(paths as never, listener);
            for (const [element, listener] of focusers) element.removeEventListener('pointerdown', listener, { capture: true });
            mounted.dispose();
            unregisterIcons();
            store = undefined;
        }
    };
}

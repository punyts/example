/**
 * The logic of the Lumen desktop as pure functions over JSON state. The host registers them as expression functions
 * (`DESK_FUNCTIONS`), and the rules in `document.ts` call them when a press writes one of the desk's inputs, then clear
 * the input so the same press works again (the pattern of Ridgeline).
 *
 * - The window manager (`deskAct`) keeps one record per app: open, minimized, snapped and stacked. It also derives what
 *   the document links to: which windows are hidden, focused and maximized, each window's placement on the desktop
 *   surface and the taskbar. A window the user drags or resizes writes its own placement (in pixels) and raises
 *   `place <app>`, which reads that placement back into the free geometry.
 * - The file system (`fsAct` and friends) keeps item records: folders, notes, pictures and uploaded files. The bytes of
 *   a picture or an upload are in the file store (OPFS, `files.ts`); an item holds the file's reference.
 *
 * A function never reads the clock: the rules pass `now()` in.
 */

export const APPS = ['files', 'notes', 'paint', 'viewer', 'ridgeline', 'settings'] as const;
export type AppId = (typeof APPS)[number];

export type Snap = 'free' | 'left' | 'right' | 'max';

export interface WindowRecord {
    open: boolean;
    minimized: boolean;
    snap: Snap;
    /** The free geometry, in pixels from the top left of the desktop surface */
    x: number;
    y: number;
    width: number;
    height: number;
    /** The stacking order among the open windows, 1 for the bottom; 0 when closed */
    z: number;
}

/** An `adhoc` placement, the shape the host writes to each window node */
export interface Placement {
    x: string;
    y: string;
    width: string;
    height: string;
    z: number;
}

export interface TaskButton {
    hidden: boolean;
    variant: 'soft' | 'ghost';
}

export interface Desk {
    windows: Record<AppId, WindowRecord>;
    /** The window in front, or '' when none is open */
    active: AppId | '';
    hidden: Record<AppId, boolean>;
    /** The window in front, per app, for each window's `active` */
    focused: Record<AppId, boolean>;
    /** The maximized windows, for each window's `maximized` */
    maximized: Record<AppId, boolean>;
    placement: Record<AppId, Placement>;
    taskbar: Record<AppId, TaskButton>;
}

/** Where each window opens when it is free, and its size */
const HOME: Readonly<Record<AppId, readonly [number, number, number, number]>> = {
    files: [150, 28, 720, 500],
    notes: [210, 60, 760, 520],
    paint: [270, 24, 640, 640],
    viewer: [330, 80, 640, 520],
    ridgeline: [170, 12, 900, 680],
    settings: [420, 110, 460, 380]
};

const isApp = (value: unknown): value is AppId => typeof value === 'string' && (APPS as readonly string[]).includes(value);

const SNAPS: readonly Snap[] = ['free', 'left', 'right', 'max'];

function closedWindow(app: AppId): WindowRecord {
    const [x, y, width, height] = HOME[app];
    return { open: false, minimized: false, snap: 'free', x, y, width, height, z: 0 };
}

function placementOf(record: WindowRecord): Placement {
    const z = record.z;
    switch (record.snap) {
        case 'left':
            return { x: '0px', y: '0px', width: '50%', height: '100%', z };
        case 'right':
            return { x: '50%', y: '0px', width: '50%', height: '100%', z };
        case 'max':
            return { x: '0px', y: '0px', width: '100%', height: '100%', z };
        default:
            return { x: `${record.x}px`, y: `${record.y}px`, width: `${record.width}px`, height: `${record.height}px`, z };
    }
}

/** Fills in what the document links to from the window records */
function derive(windows: Record<AppId, WindowRecord>, active: AppId | ''): Desk {
    const hidden = {} as Record<AppId, boolean>;
    const focused = {} as Record<AppId, boolean>;
    const maximized = {} as Record<AppId, boolean>;
    const placement = {} as Record<AppId, Placement>;
    const taskbar = {} as Record<AppId, TaskButton>;
    for (const app of APPS) {
        const record = windows[app];
        hidden[app] = !record.open || record.minimized;
        focused[app] = app === active;
        maximized[app] = record.snap === 'max';
        placement[app] = placementOf(record);
        taskbar[app] = { hidden: !record.open, variant: app === active ? 'soft' : 'ghost' };
    }
    return { windows, active, hidden, focused, maximized, placement, taskbar };
}

/** A desk with every window closed */
export function emptyDesk(): Desk {
    const windows = {} as Record<AppId, WindowRecord>;
    for (const app of APPS) windows[app] = closedWindow(app);
    return derive(windows, '');
}

/** Renumbers the open windows 1, 2, 3 ... in their stacking order with `top` (if given) last, so `z` stays small */
function restack(windows: Record<AppId, WindowRecord>, top?: AppId): Record<AppId, WindowRecord> {
    const open = APPS.filter((app) => windows[app].open && app !== top).sort((a, b) => windows[a].z - windows[b].z);
    if (top !== undefined && windows[top].open) open.push(top);
    const next = {} as Record<AppId, WindowRecord>;
    for (const app of APPS) next[app] = { ...windows[app], z: 0 };
    open.forEach((app, index) => {
        next[app] = { ...next[app], z: index + 1 };
    });
    return next;
}

/** The front window that is showing, or '' */
function frontmost(windows: Record<AppId, WindowRecord>): AppId | '' {
    let best: AppId | '' = '';
    for (const app of APPS) {
        const record = windows[app];
        if (!record.open || record.minimized) continue;
        if (best === '' || record.z > windows[best].z) best = app;
    }
    return best;
}

/** A whole number of pixels from a placement field such as `"120px"`; undefined for a percentage or anything else */
function pixels(value: unknown): number | undefined {
    const match = typeof value === 'string' ? /^(-?\d+(?:\.\d+)?)px$/.exec(value) : null;
    return match ? Math.round(Number(match[1])) : undefined;
}

/** The free geometry of a placement the window wrote in pixels; undefined when a field is not in pixels */
function placedGeometry(desk: unknown, app: AppId): Pick<WindowRecord, 'x' | 'y' | 'width' | 'height'> | undefined {
    const placement = desk !== null && typeof desk === 'object' ? (desk as { placement?: Record<string, Partial<Record<keyof Placement, unknown>>> }).placement?.[app] : undefined;
    const x = pixels(placement?.x);
    const y = pixels(placement?.y);
    const width = pixels(placement?.width);
    const height = pixels(placement?.height);
    if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
    return { x, y, width, height };
}

/** Reads a desk from state, tolerating a missing or partial one */
function readDesk(value: unknown): Record<AppId, WindowRecord> {
    const windows = {} as Record<AppId, WindowRecord>;
    const source = (value !== null && typeof value === 'object' ? (value as { windows?: unknown }).windows : undefined) as Record<string, Partial<WindowRecord>> | undefined;
    for (const app of APPS) windows[app] = { ...closedWindow(app), ...(source?.[app] ?? {}) };
    return windows;
}

/**
 * Applies one window command to the desk: `open <app>`, `close <app>`, `focus <app>`, `minimize <app>`,
 * `task <app>` (a taskbar press: restore, bring to the front, or minimize the front window), `maximize <app>` (toggles
 * between maximized and free), `snap <app> <free|left|right|max>` and `place <app>` (the window was dragged or
 * resized: its placement, in pixels, becomes its free geometry and it is no longer snapped). Anything else returns the
 * desk unchanged
 */
export function deskAct(desk: unknown, command: unknown): Desk {
    let windows = readDesk(desk);
    const current = derive(windows, frontmost(windows));
    if (typeof command !== 'string' || command.trim() === '') return current;
    const [verb, app, arg] = command.trim().split(/\s+/);
    if (!isApp(app)) return current;
    const record = windows[app];
    const set = (patch: Partial<WindowRecord>): void => {
        windows = { ...windows, [app]: { ...windows[app], ...patch } };
    };
    switch (verb) {
        case 'open':
        case 'focus':
            if (verb === 'focus' && !record.open) return current;
            set({ open: true, minimized: false });
            windows = restack(windows, app);
            break;
        case 'close':
            windows = restack({ ...windows, [app]: closedWindow(app) });
            break;
        case 'minimize':
            if (!record.open) return current;
            set({ minimized: true });
            break;
        case 'task':
            if (!record.open) return current;
            if (!record.minimized && current.active === app) set({ minimized: true });
            else {
                set({ minimized: false });
                windows = restack(windows, app);
            }
            break;
        case 'maximize':
            if (!record.open) return current;
            set({ snap: record.snap === 'max' ? 'free' : 'max', minimized: false });
            windows = restack(windows, app);
            break;
        case 'snap':
            if (!record.open || !SNAPS.includes(arg as Snap)) return current;
            set({ snap: arg as Snap, minimized: false });
            windows = restack(windows, app);
            break;
        case 'place': {
            const geometry = placedGeometry(desk, app);
            if (!record.open || geometry === undefined) return current;
            set({ ...geometry, snap: 'free' });
            break;
        }
        default:
            return current;
    }
    return derive(windows, frontmost(windows));
}

// ---------------------------------------------------------------------------------------------------------------
// The file system

export type ItemKind = 'folder' | 'note' | 'picture' | 'file';

/** A file reference as `transferFile` returns it */
export interface FileRef {
    id: string;
    name: string;
    size: number;
    type: string;
}

export interface FsItem {
    id: string;
    name: string;
    /** The id of the folder that holds it; '' for the top folder */
    parent: string;
    kind: ItemKind;
    /** The Markdown of a note */
    text?: string;
    /** The stored file of a picture or an upload */
    file?: FileRef;
    /** When it last changed, an ISO date */
    modified: string;
}

export interface ListingRow {
    id: string;
    name: string;
    icon: string;
    detail: string;
}

export interface FolderNode {
    id: string;
    parentId: string | null;
    label: string;
    hasChildren: boolean;
}

export interface Fs {
    items: FsItem[];
    /** The number the next new item's id is made from */
    nextId: number;
    /** The open folder */
    folder: string;
    /** The selected item of the open folder, or '' */
    selected: string;
    /** The name field: the name for a new folder or note, or a rename */
    name: string;
    /** The id of the item the last command made or changed */
    last: string;
    /** Derived: the items of the open folder, folders first */
    listing: ListingRow[];
    /** Derived: the folder tree */
    folders: FolderNode[];
    /** Derived: the open folder's path, "Home / Documents" */
    path: string;
}

export const HOME_FOLDER = 'home';
export const DOCUMENTS = 'documents';
export const PICTURES = 'pictures';

const WELCOME = `# Welcome to Lumen

Lumen is a desktop that runs in this browser tab. Everything you make is kept in the browser's private file system,
so it is still here after a reload.

- **Files** shows your folders. Double-click an item to open it.
- **Notes** edits Markdown, like this note.
- **Paint** draws pictures into *Pictures*.
- **Ridgeline** is a board game for two.
`;

/** The items of a new file system: the home folder with Documents, Pictures and a welcome note */
export function seedItems(modified: string): FsItem[] {
    return [
        { id: HOME_FOLDER, name: 'Home', parent: '', kind: 'folder', modified },
        { id: DOCUMENTS, name: 'Documents', parent: HOME_FOLDER, kind: 'folder', modified },
        { id: PICTURES, name: 'Pictures', parent: HOME_FOLDER, kind: 'folder', modified },
        { id: 'welcome', name: 'Welcome.md', parent: DOCUMENTS, kind: 'note', text: WELCOME, modified }
    ];
}

/** The icon of each kind of item; the listing names them in data, so `npm run icons` reads this list too */
export const ITEM_ICONS: Readonly<Record<ItemKind, string>> = { folder: 'folder', note: 'file-text', picture: 'photo', file: 'file' };

const first = (value: unknown): string => {
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
    return typeof value === 'string' ? value : '';
};

function sizeText(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / (1024 * 104.8576)) / 10} MB`;
}

function detailOf(item: FsItem, items: readonly FsItem[]): string {
    switch (item.kind) {
        case 'folder': {
            const count = items.filter((other) => other.parent === item.id).length;
            return count === 1 ? 'Folder, 1 item' : `Folder, ${count} items`;
        }
        case 'note': {
            const words = (item.text ?? '').split(/\s+/).filter((word) => word !== '').length;
            return words === 1 ? 'Note, 1 word' : `Note, ${words} words`;
        }
        case 'picture':
            return `Picture, ${sizeText(item.file?.size ?? 0)}`;
        default:
            return `${item.file?.type || 'File'}, ${sizeText(item.file?.size ?? 0)}`;
    }
}

/** The items of `folder`, folders first, then by name */
export function fsListing(items: unknown, folder: unknown): ListingRow[] {
    const all = Array.isArray(items) ? (items as FsItem[]) : [];
    const id = first(folder);
    return all
        .filter((item) => item.parent === id)
        .sort((a, b) => (a.kind === 'folder') === (b.kind === 'folder') ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1)
        .map((item) => ({ id: item.id, name: item.name, icon: ITEM_ICONS[item.kind], detail: detailOf(item, all) }));
}

/** The folders as tree records */
export function fsFolders(items: unknown): FolderNode[] {
    const all = Array.isArray(items) ? (items as FsItem[]) : [];
    const folders = all.filter((item) => item.kind === 'folder');
    return folders
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((folder) => ({
            id: folder.id,
            parentId: folder.parent === '' ? null : folder.parent,
            label: folder.name,
            hasChildren: folders.some((other) => other.parent === folder.id)
        }));
}

/** "Home / Documents" */
export function fsPath(items: unknown, folder: unknown): string {
    const all = Array.isArray(items) ? (items as FsItem[]) : [];
    const names: string[] = [];
    let id = first(folder);
    for (let guard = 0; id !== '' && guard < 32; guard++) {
        const item = all.find((other) => other.id === id);
        if (item === undefined) break;
        names.unshift(item.name);
        id = item.parent;
    }
    return names.join(' / ');
}

/** Reads a file system from state, tolerating a missing or partial one */
function readFs(value: unknown): Fs {
    const source = (value !== null && typeof value === 'object' ? value : {}) as Partial<Fs>;
    const items = Array.isArray(source.items) ? source.items : [];
    const folder = first(source.folder) || HOME_FOLDER;
    return {
        items,
        nextId: typeof source.nextId === 'number' ? source.nextId : 1,
        folder,
        selected: first(source.selected),
        name: typeof source.name === 'string' ? source.name : '',
        last: typeof source.last === 'string' ? source.last : '',
        listing: [],
        folders: [],
        path: ''
    };
}

/** Fills in the listing, the tree and the path */
export function fsView(fs: unknown): Fs {
    const state = readFs(fs);
    return { ...state, listing: fsListing(state.items, state.folder), folders: fsFolders(state.items), path: fsPath(state.items, state.folder) };
}

/** A name not yet used in `folder`: "Notes", "Notes 2", "Notes 3" ... */
function freeName(items: readonly FsItem[], folder: string, wanted: string, except = ''): string {
    const taken = new Set(items.filter((item) => item.parent === folder && item.id !== except).map((item) => item.name.toLowerCase()));
    if (!taken.has(wanted.toLowerCase())) return wanted;
    const dot = wanted.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [wanted.slice(0, dot), wanted.slice(dot)] : [wanted, ''];
    for (let n = 2; ; n++) {
        const name = `${stem} ${n}${ext}`;
        if (!taken.has(name.toLowerCase())) return name;
    }
}

/** The id of `id` and every item below it */
function subtree(items: readonly FsItem[], id: string): Set<string> {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const item of items) {
            if (!ids.has(item.id) && ids.has(item.parent)) {
                ids.add(item.id);
                grew = true;
            }
        }
    }
    return ids;
}

/** True for a non-empty input: a rule also runs when it clears its input, and that run must change nothing */
const asked = (ask: unknown): boolean => typeof ask === 'string' && ask !== '';

const clean = (name: unknown): string => (typeof name === 'string' ? name.replace(/[/\\]/g, '-').trim().slice(0, 80) : '');

/**
 * Applies one file command: `newFolder` and `newNote` (named by the name field, in the open folder), `rename` (the
 * selected item, to the name field), `delete` (the selected item and all below it), `up` (to the parent folder).
 * `now` is the time the change is stamped with
 */
export function fsAct(fs: unknown, command: unknown, now: unknown): Fs {
    const state = readFs(fs);
    const modified = typeof now === 'string' ? now : '';
    const { items, folder, selected } = state;
    const named = clean(state.name);
    let next: Fs = state;
    switch (command) {
        case 'newFolder': {
            const id = `i${state.nextId}`;
            const name = freeName(items, folder, named || 'New folder');
            next = { ...state, items: [...items, { id, name, parent: folder, kind: 'folder', modified }], nextId: state.nextId + 1, selected: id, last: id, name: '' };
            break;
        }
        case 'newNote': {
            const id = `i${state.nextId}`;
            const base = named || 'Untitled';
            const name = freeName(items, folder, /\.md$/i.test(base) ? base : `${base}.md`);
            next = { ...state, items: [...items, { id, name, parent: folder, kind: 'note', text: '', modified }], nextId: state.nextId + 1, selected: id, last: id, name: '' };
            break;
        }
        case 'rename': {
            const item = items.find((other) => other.id === selected);
            if (item === undefined || named === '' || item.id === HOME_FOLDER) break;
            const name = freeName(items, item.parent, named, item.id);
            next = { ...state, items: items.map((other) => (other.id === item.id ? { ...other, name, modified } : other)), last: item.id, name: '' };
            break;
        }
        case 'delete': {
            if (selected === '' || selected === HOME_FOLDER || !items.some((item) => item.id === selected)) break;
            const gone = subtree(items, selected);
            next = { ...state, items: items.filter((item) => !gone.has(item.id)), selected: '', last: selected };
            break;
        }
        case 'up': {
            const current = items.find((item) => item.id === folder);
            if (current === undefined || current.parent === '') break;
            next = { ...state, folder: current.parent, selected: folder };
            break;
        }
        default:
            break;
    }
    return fsView(next);
}

/**
 * The item an open asks for: an item id, or `selected` for the selected item (an `on` value is literal, so the Open
 * button cannot pass the selection itself)
 */
export function fsPick(ask: unknown, selected: unknown): string {
    const id = first(ask);
    return id === 'selected' ? first(selected) : id;
}

/** Opens an item from the listing: a folder becomes the open folder, anything else becomes the selection */
export function fsEnter(fs: unknown, id: unknown): Fs {
    const state = readFs(fs);
    const item = state.items.find((other) => other.id === first(id));
    if (item === undefined) return fsView(state);
    return fsView(item.kind === 'folder' ? { ...state, folder: item.id, selected: '' } : { ...state, selected: item.id });
}

/** The window command that shows an item: notes in Notes, pictures in the Viewer; '' for a folder or another file */
export function fsOpenCommand(items: unknown, id: unknown): string {
    const all = Array.isArray(items) ? (items as FsItem[]) : [];
    const item = all.find((other) => other.id === first(id));
    if (item?.kind === 'note') return 'open notes';
    if (item?.kind === 'picture' || (item?.kind === 'file' && /^image\//.test(item.file?.type ?? ''))) return 'open viewer';
    return '';
}

export interface NoteDraft {
    id: string;
    name: string;
    text: string;
}

/** The note editor showing note `id`, or `draft` unchanged when `id` is not a note */
export function notesLoad(draft: unknown, items: unknown, id: unknown): NoteDraft {
    const all = Array.isArray(items) ? (items as FsItem[]) : [];
    const item = all.find((other) => other.id === first(id));
    if (item?.kind !== 'note') return readDraft(draft);
    return { id: item.id, name: item.name, text: item.text ?? '' };
}

function readDraft(value: unknown): NoteDraft {
    const source = (value !== null && typeof value === 'object' ? value : {}) as Partial<NoteDraft>;
    return { id: typeof source.id === 'string' ? source.id : '', name: typeof source.name === 'string' ? source.name : '', text: typeof source.text === 'string' ? source.text : '' };
}

/**
 * Saves the note editor: over its note when it has one, else as a new note in Documents. `last` names the note.
 * `ask` is the input that asked for it: an empty one (the rule clearing it) changes nothing
 */
export function fsSaveNote(fs: unknown, draft: unknown, now: unknown, ask: unknown): Fs {
    const state = readFs(fs);
    if (!asked(ask)) return fsView(state);
    const note = readDraft(draft);
    const modified = typeof now === 'string' ? now : '';
    const existing = state.items.find((item) => item.id === note.id && item.kind === 'note');
    if (existing !== undefined) {
        const base = clean(note.name) || existing.name;
        const name = freeName(state.items, existing.parent, /\.md$/i.test(base) ? base : `${base}.md`, existing.id);
        const items = state.items.map((item) => (item.id === existing.id ? { ...item, name, text: note.text, modified } : item));
        return fsView({ ...state, items, last: existing.id });
    }
    const id = `i${state.nextId}`;
    const parent = state.items.some((item) => item.id === DOCUMENTS) ? DOCUMENTS : HOME_FOLDER;
    const base = clean(note.name) || 'Untitled';
    const name = freeName(state.items, parent, /\.md$/i.test(base) ? base : `${base}.md`);
    const items = [...state.items, { id, name, parent, kind: 'note' as const, text: note.text, modified }];
    return fsView({ ...state, items, nextId: state.nextId + 1, last: id });
}

/** The note editor after a save: it now edits the saved note */
export function notesSaved(fs: unknown, draft: unknown, ask: unknown): NoteDraft {
    const state = readFs(fs);
    if (!asked(ask)) return readDraft(draft);
    const item = state.items.find((other) => other.id === state.last && other.kind === 'note');
    const note = readDraft(draft);
    return item === undefined ? note : { id: item.id, name: item.name, text: note.text };
}

const isFileRef = (value: unknown): value is FileRef =>
    value !== null && typeof value === 'object' && typeof (value as FileRef).id === 'string' && (value as FileRef).id !== '';

/**
 * The ids of the stored files these values still use: every file reference found in them, at any depth (the items, the
 * Paint picture not saved yet, the uploads on their way in). The host removes the other files from the store
 */
export function usedFileIds(...values: unknown[]): Set<string> {
    const used = new Set<string>();
    const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
            for (const entry of value) walk(entry);
        } else if (value !== null && typeof value === 'object') {
            // A file reference has a size; an item (which also has an id) does not
            if (isFileRef(value) && typeof (value as FileRef).size === 'number') used.add(value.id);
            for (const entry of Object.values(value)) walk(entry);
        }
    };
    for (const value of values) walk(value);
    return used;
}

/** Saves the Paint picture (a PNG file reference) into Pictures under `name`; nothing when nothing is drawn */
export function fsSavePicture(fs: unknown, picture: unknown, name: unknown, now: unknown, ask: unknown): Fs {
    const state = readFs(fs);
    if (!asked(ask) || !isFileRef(picture)) return fsView(state);
    const parent = state.items.some((item) => item.id === PICTURES) ? PICTURES : HOME_FOLDER;
    const base = clean(name) || 'Drawing';
    const fileName = freeName(state.items, parent, /\.png$/i.test(base) ? base : `${base}.png`);
    const id = `i${state.nextId}`;
    const items = [...state.items, { id, name: fileName, parent, kind: 'picture' as const, file: picture, modified: typeof now === 'string' ? now : '' }];
    return fsView({ ...state, items, nextId: state.nextId + 1, last: id });
}

/** Adds uploaded files (file references) to the open folder; images become pictures */
export function fsUpload(fs: unknown, files: unknown, now: unknown): Fs {
    const state = readFs(fs);
    const refs = (Array.isArray(files) ? files : []).filter(isFileRef);
    if (refs.length === 0) return fsView(state);
    let { items, nextId } = state;
    let last = state.last;
    for (const file of refs) {
        const id = `i${nextId++}`;
        const kind: ItemKind = /^image\//.test(file.type) ? 'picture' : 'file';
        items = [...items, { id, name: freeName(items, state.folder, clean(file.name) || 'File'), parent: state.folder, kind, file, modified: typeof now === 'string' ? now : '' }];
        last = id;
    }
    return fsView({ ...state, items, nextId, last, selected: last });
}

export interface ViewerState {
    id: string;
    name: string;
    /** The file reference the drawing shows, or null */
    file: FileRef | null;
    /** No picture to show: the drawing hides and the empty state shows */
    empty: boolean;
    has: boolean;
}

/** The Viewer showing item `id`, or `viewer` unchanged when it is not a picture */
export function viewerLoad(viewer: unknown, items: unknown, id: unknown): ViewerState {
    const all = Array.isArray(items) ? (items as FsItem[]) : [];
    const item = all.find((other) => other.id === first(id));
    if (item?.file !== undefined && (item.kind === 'picture' || /^image\//.test(item.file.type))) {
        return { id: item.id, name: item.name, file: item.file, empty: false, has: true };
    }
    const source = (viewer !== null && typeof viewer === 'object' ? viewer : {}) as Partial<ViewerState>;
    const file = source.file ?? null;
    return { id: source.id ?? '', name: source.name ?? '', file, empty: file === null, has: file !== null };
}

// ---------------------------------------------------------------------------------------------------------------
// Wallpapers

export type Wallpaper = 'dawn' | 'dusk' | 'meadow';

interface Gradient {
    kind: 'linear' | 'radial';
    angle?: number;
    center?: [number, number];
    stops: Record<string, { offset: number; color: string }>;
}

const stops = (...colors: string[]): Gradient['stops'] =>
    Object.fromEntries(colors.map((color, index) => [`s${index}`, { offset: colors.length === 1 ? 0 : index / (colors.length - 1), color }]));

const WALLPAPERS: Readonly<Record<Wallpaper, readonly [string[], string[], string, string]>> = {
    dawn: [['#2b3a67', '#7a6fa8', '#f2a97e', '#ffd9a8'], ['#fff3d6', '#ffd9a800'], '#5a4a7a', '#3a3358'],
    dusk: [['#0d1b2a', '#1b3a5b', '#46406f', '#a35d6a'], ['#ffd1a6', '#ffd1a600'], '#22304a', '#141d30'],
    meadow: [['#7cc6e8', '#b6e0ee', '#e6f4ea'], ['#fffbe0', '#fffbe000'], '#6ea86a', '#3f7d4a']
};

/** The paints of the wallpaper drawing: the sky, the glow of the sun and the two hills */
export function deskWallpaper(name: unknown): Record<string, Gradient> {
    const [sky, glow, far, near] = WALLPAPERS[(name as Wallpaper) in WALLPAPERS ? (name as Wallpaper) : 'dawn'];
    return {
        sky: { kind: 'linear', angle: 90, stops: stops(...sky) },
        glow: { kind: 'radial', center: [0.5, 0.5], stops: stops(...glow) },
        far: { kind: 'linear', angle: 90, stops: stops(far, near) },
        near: { kind: 'linear', angle: 90, stops: stops(near, near) }
    };
}

/** The functions the host registers as expression functions */
export const DESK_FUNCTIONS = {
    deskAct,
    deskWallpaper,
    fsAct,
    fsEnter,
    fsView,
    fsListing,
    fsPath,
    fsOpenCommand,
    fsPick,
    fsSaveNote,
    fsSavePicture,
    fsUpload,
    notesLoad,
    notesSaved,
    viewerLoad
} as const;

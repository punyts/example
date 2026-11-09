/**
 * The Lumen desktop document. It is built in code rather than written as JSON because six windows share one shape (a
 * library `window` wired to the desk) and differ only in their app, title and content; what it builds is plain JSON all
 * the same, and `scripts/validate.ts` checks it as it checks Northwind Ops.
 *
 * One screen, `desk`: a column of the desktop surface (an `adhoc` layout of the wallpaper, the desktop icons and the
 * windows) and the taskbar. Each window's `hidden`, `placement`, `active` and `maximized` link to the desk state, so
 * a window moves, stacks and hides when the state changes; a window the user drags or resizes writes its placement
 * itself and raises `move` or `resize`, which the desk reads back with `place <app>`. Every press writes an input under
 * `$.data.input`, and the rules (`DESK_LOGIC`) answer it with the functions of `desk.ts`.
 */
import type { AppDocument } from '@punyts/stateui-app/core';
import main from '../document/main.json' with { type: 'json' };
import northwindLogic from '../document/logic.json' with { type: 'json' };
import { emptyGame } from '../seed.ts';
import { APPS, deskWallpaper, emptyDesk, fsView, seedItems, viewerLoad } from './desk.ts';
import type { AppId } from './desk.ts';

type Json = Record<string, unknown>;

/** The state path of the screen's nodes the host talks to */
export const DESK_PATHS = {
    surface: '$.screens.desk.children.surface',
    taskbar: '$.screens.desk.children.taskbar',
    window: (app: AppId): string => `$.screens.desk.children.surface.children.${app}`,
    deleteDialog: '$.screens.desk.children.surface.children.files.children.confirm'
} as const;

export const TITLES: Readonly<Record<AppId, string>> = {
    files: 'Files',
    notes: 'Notes',
    paint: 'Paint',
    viewer: 'Viewer',
    ridgeline: 'Ridgeline',
    settings: 'Settings'
};

export const APP_ICONS: Readonly<Record<AppId, string>> = {
    files: 'folder',
    notes: 'notes',
    paint: 'brush',
    viewer: 'photo',
    ridgeline: 'chess',
    settings: 'settings'
};

const set = (target: string, value: unknown): Json => ({ command: 'set', target, value });
const desk = (command: string): Json => set('$.data.input.desk', command);
const toast = (key: string): Json => ({ command: 'show', target: '$.app.toasts', value: key });

const button = (title: string, icon: string, press: Json | Json[], extra: Json = {}): Json => ({
    component: 'button',
    _title: title,
    icon,
    on: { press },
    ...extra
});

const ghost = (title: string, icon: string, press: Json | Json[]): Json =>
    button(title, icon, press, { variant: 'ghost', size: 'sm', iconPosition: 'only', tone: 'neutral' });

/** One window: a library `window` whose events write the desk input, its content, and links to its state */
function appWindow(app: AppId, layout: Json, children: Json): Json {
    return {
        component: 'window',
        _title: TITLES[app],
        icon: APP_ICONS[app],
        controls: ['snapLeft', 'snapRight', 'minimize', 'maximize', 'close'],
        _snapLeftLabel: 'Snap to the left half',
        _snapRightLabel: 'Snap to the right half',
        '<-hidden': `$.data.desk.state.hidden.${app}`,
        '<-placement': `$.data.desk.state.placement.${app}`,
        '<-active': `$.data.desk.state.focused.${app}`,
        '<-maximized': `$.data.desk.state.maximized.${app}`,
        layout,
        children,
        on: {
            activate: desk(`focus ${app}`),
            move: desk(`place ${app}`),
            resize: desk(`place ${app}`),
            snapLeft: desk(`snap ${app} left`),
            snapRight: desk(`snap ${app} right`),
            minimize: desk(`minimize ${app}`),
            maximize: desk(`maximize ${app}`),
            close: desk(`close ${app}`)
        }
    };
}

const START = emptyDesk();

const fsInput = (command: string): Json => set('$.data.input.fs', command);

const FILES = appWindow('files', { type: 'column', gap: 'sm' }, {
    bar: {
        component: 'toolbar',
        align: 'between',
        children: {
            up: ghost('Up one folder', 'arrow-up', fsInput('up')),
            path: { component: 'text', textRole: 'label', '<-_text': '$.data.fs.path' },
            open: button('Open', 'folder-open', { command: 'set', target: '$.data.input.open', from: '$.data.fs.selected' }, { variant: 'soft', size: 'sm' })
        }
    },
    browse: {
        component: 'panel',
        padding: 'none',
        placement: { grow: 1 },
        layout: { type: 'row', gap: 'sm', align: 'stretch' },
        children: {
            tree: {
                component: 'tree',
                placement: { grow: 1 },
                key: 'id',
                parentField: 'parentId',
                labelField: 'label',
                hasChildrenField: 'hasChildren',
                selectable: 'single',
                expanded: ['home'],
                '<-records': '$.data.fs.folders',
                '<-selected': '$.data.fs.folder',
                row: {
                    component: 'panel',
                    padding: 'none',
                    layout: { type: 'row', gap: 'sm', align: 'center' },
                    children: {
                        icon: { component: 'icon', name: 'folder', decorative: true },
                        name: { component: 'text', truncate: 1, '<-_text': '$row.label' }
                    }
                }
            },
            listing: {
                component: 'list',
                placement: { grow: 2 },
                divided: true,
                selectable: 'single',
                '<-items': '$.data.fs.listing',
                '<-selected': '$.data.fs.selected',
                _empty: 'This folder is empty',
                on: { activate: { command: 'emit', target: 'fs.open' } },
                row: {
                    component: 'panel',
                    padding: 'none',
                    layout: { type: 'row', gap: 'sm', align: 'center' },
                    children: {
                        icon: { component: 'icon', '<-name': '$row.icon', decorative: true },
                        name: { component: 'text', placement: { grow: 1 }, truncate: 1, '<-_text': '$row.name' },
                        detail: { component: 'text', textRole: 'caption', '<-_text': '$row.detail' }
                    }
                }
            }
        }
    },
    edit: {
        component: 'toolbar',
        wrap: true,
        children: {
            name: { component: 'textField', size: 'sm', titlePosition: 'hidden', width: 22, _label: 'Name', _placeholder: 'Name', '<-value': '$.data.fs.name' },
            newFolder: button('New folder', 'folder-plus', fsInput('newFolder'), { variant: 'soft', size: 'sm' }),
            newNote: button('New note', 'file-plus', fsInput('newNote'), { variant: 'soft', size: 'sm' }),
            rename: button('Rename', 'pencil', fsInput('rename'), { variant: 'soft', size: 'sm' }),
            remove: button('Delete', 'trash', { command: 'open', target: DESK_PATHS.deleteDialog }, { variant: 'soft', size: 'sm', tone: 'danger' })
        }
    },
    upload: {
        component: 'fileField',
        _label: 'Upload into this folder',
        maxFiles: 5,
        '<-value': '$.data.upload'
    },
    confirm: {
        component: 'confirmDialog',
        _title: 'Delete this item?',
        body: { _text: 'The selected item, and everything in it if it is a folder, is deleted for good.' },
        footer: {
            children: {
                confirm: {
                    _title: 'Delete',
                    on: { press: [{ command: 'close', target: '^confirmDialog' }, fsInput('delete')] }
                }
            }
        }
    }
});

const NOTES = appWindow('notes', { type: 'column', gap: 'sm' }, {
    bar: {
        component: 'toolbar',
        children: {
            name: { component: 'textField', size: 'sm', titlePosition: 'hidden', width: 26, _label: 'Note name', '<-value': '$.data.notes.name' },
            fresh: button('New', 'file-plus', set('$.data.notes', { id: '', name: 'Untitled.md', text: '' }), { variant: 'soft', size: 'sm' }),
            save: button('Save', 'device-floppy', [set('$.data.input.note', 'save'), toast('noteSaved')], { size: 'sm' })
        }
    },
    split: {
        component: 'panel',
        padding: 'none',
        placement: { grow: 1 },
        layout: { type: 'row', gap: 'md', align: 'stretch' },
        children: {
            text: { component: 'textarea', placement: { grow: 1 }, rows: 16, _label: 'Markdown', '<-value': '$.data.notes.text' },
            preview: {
                component: 'panel',
                placement: { grow: 1 },
                bordered: true,
                padding: 'sm',
                _title: 'Preview',
                children: { markdown: { component: 'markdown', '<-_text': '$.data.notes.text' } }
            }
        }
    }
});

const PAINT = appWindow('paint', { type: 'column', gap: 'sm' }, {
    bar: {
        component: 'toolbar',
        children: {
            name: { component: 'textField', size: 'sm', titlePosition: 'hidden', width: 24, _label: 'Picture name', '<-value': '$.data.paint.name' },
            save: button('Save to Pictures', 'device-floppy', [set('$.data.input.picture', 'save'), toast('pictureSaved')], { size: 'sm' })
        }
    },
    canvas: {
        component: 'paintField',
        width: 600,
        height: 380,
        tools: ['brush', 'eraser', 'line', 'rect', 'ellipse', 'fill'],
        colors: ['#1d2433', '#e4572e', '#f3a712', '#29bf12', '#2e86de', '#a05195', '#ffffff'],
        background: '#ffffff',
        _label: 'Picture',
        '<-value': '$.data.paint.picture'
    }
});

const VIEWER = appWindow('viewer', { type: 'column', gap: 'sm' }, {
    name: { component: 'text', textRole: 'label', '<-_text': '$.data.viewer.name' },
    picture: {
        component: 'drawing',
        _title: 'Picture',
        viewBox: { x: 0, y: 0, width: 600, height: 400 },
        '<-hidden': '$.data.viewer.empty',
        children: {
            image: { component: 'drawImage', x: 0, y: 0, width: 600, height: 400, fit: 'contain', '<-src': '$.data.viewer.file', _label: 'The open picture' }
        }
    },
    none: {
        component: 'emptyState',
        icon: 'photo',
        _title: 'No picture open',
        _text: 'Open a picture from Files, or save one in Paint.',
        '<-hidden': '$.data.viewer.has'
    }
});

/** Ridgeline's board and score from Northwind Ops; the long rules stay there (and in the README), so the window fits */
function ridgelineChildren(): Json {
    const panel = (main as unknown as { children: { ridgeline: { children: Record<string, Json & { children: Json }> } } }).children.ridgeline;
    const children = structuredClone(panel.children);
    const side = children['side'] as Json & { children: Json };
    delete side.children['rulesTitle'];
    delete side.children['rules'];
    return children;
}

const RIDGELINE = appWindow('ridgeline', (main as unknown as { children: { ridgeline: { layout: Json } } }).children.ridgeline.layout, ridgelineChildren());

const SETTINGS = appWindow('settings', { type: 'column', gap: 'md' }, {
    wallpaper: {
        component: 'segmented',
        _label: 'Wallpaper',
        '<-value': '$.data.desk.prefs.wallpaper',
        options: { dawn: { _label: 'Dawn' }, dusk: { _label: 'Dusk' }, meadow: { _label: 'Meadow' } }
    },
    dark: {
        component: 'toolbar',
        align: 'between',
        children: {
            label: { component: 'text', _text: 'Dark windows' },
            toggle: { component: 'switch', _label: 'Dark windows', '<-checked': '$.data.desk.prefs.dark' }
        }
    },
    storage: { component: 'text', textRole: 'caption', '<-_text': '$.data.desk.storage' }
});

/** The wallpaper: a sky, the glow of a low sun and two hills, painted from `$.data.desk.paints` */
const WALLPAPER = {
    component: 'drawing',
    _title: 'Wallpaper',
    fit: 'cover',
    // A drawing is as tall as its theme says; the wallpaper fills its placement
    theme: { drawing: { height: '100%' } },
    viewBox: { x: 0, y: 0, width: 1600, height: 900 },
    '<-paints': '$.data.desk.paints',
    placement: { x: '0px', y: '0px', width: '100%', height: '100%', z: 0 },
    children: {
        sky: { component: 'rect', x: 0, y: 0, width: 1600, height: 900, fill: 'sky' },
        glow: { component: 'circle', cx: 1120, cy: 560, r: 420, fill: 'glow' },
        sun: { component: 'circle', cx: 1120, cy: 560, r: 70, fill: '#fff4dc', opacity: 0.9 },
        far: { component: 'path', d: 'M0 640 C 260 540 520 600 760 560 C 1000 520 1260 600 1600 540 L 1600 900 L 0 900 Z', fill: 'far' },
        near: { component: 'path', d: 'M0 760 C 300 690 620 780 900 730 C 1180 680 1400 740 1600 700 L 1600 900 L 0 900 Z', fill: 'near' }
    }
};

/** The icons on the desktop, one button per app down the left edge */
function desktopIcons(): Json {
    const icons: Json = {};
    APPS.forEach((app, index) => {
        icons[`icon_${app}`] = button(TITLES[app], APP_ICONS[app], desk(`open ${app}`), {
            variant: 'soft',
            tone: 'neutral',
            placement: { x: '16px', y: `${16 + index * 52}px`, width: '120px', height: '40px', z: 0 }
        });
    });
    return icons;
}

/** The desktop surface: an `adhoc` area that clips what is dragged past its edge, so no window covers the taskbar */
const surface = (height: string): Json => ({
    component: 'panel',
    padding: 'none',
    placement: { height },
    layout: { type: 'adhoc', clip: true },
    children: {
        wallpaper: WALLPAPER,
        ...desktopIcons(),
        files: FILES,
        notes: NOTES,
        paint: PAINT,
        viewer: VIEWER,
        ridgeline: RIDGELINE,
        settings: SETTINGS
    }
});

function launcherItems(): Json {
    const items: Json = {};
    for (const app of APPS) items[app] = { component: 'menuItem', icon: APP_ICONS[app], _label: TITLES[app], on: { press: desk(`open ${app}`) } };
    return items;
}

function taskButtons(): Json {
    const buttons: Json = {};
    for (const app of APPS) {
        buttons[app] = button(TITLES[app], APP_ICONS[app], desk(`task ${app}`), {
            size: 'sm',
            tone: 'neutral',
            '<-hidden': `$.data.desk.state.taskbar.${app}.hidden`,
            '<-variant': `$.data.desk.state.taskbar.${app}.variant`
        });
    }
    return buttons;
}

const TASKBAR = {
    component: 'panel',
    padding: 'sm',
    elevation: 'raised',
    layout: { type: 'row', gap: 'md', align: 'center' },
    children: {
        launcher: {
            component: 'menu',
            anchor: 'topStart',
            _label: 'Apps',
            trigger: { component: 'button', icon: 'apps', size: 'sm', _title: 'Lumen' },
            children: launcherItems()
        },
        tasks: { component: 'toolbar', placement: { grow: 1 }, children: taskButtons() },
        clock: { component: 'text', textRole: 'label', '<-_text': '$.data.desk.clock' }
    }
};

const screen = (surfaceHeight: string): Json => ({
    component: 'panel',
    padding: 'none',
    layout: { type: 'column', gap: 'none' },
    children: { surface: surface(surfaceHeight), taskbar: TASKBAR }
});

const APP = {
    component: 'app',
    _title: 'Lumen',
    toasts: {
        component: 'toastRegion',
        position: 'bottomEnd',
        max: 3,
        _label: 'Notifications',
        messages: {
            noteSaved: { tone: 'success', _title: 'Note saved', _text: 'It is in your files.' },
            pictureSaved: { tone: 'success', _title: 'Picture saved', _text: 'Find it in Pictures.' }
        }
    }
};

const input = (path: string): string => `$.data.input.${path}`;

/** A rule that answers an input with commands and then clears it */
const answer = (path: string, commands: Json[]): Json => ({
    when: { path: input(path) },
    do: [...commands, set(input(path), '')]
});

const ridgelineRules = northwindLogic.rules as unknown as Record<string, Json>;

export const DESK_LOGIC = {
    rules: {
        desk: answer('desk', [set('$.data.desk.state', '{{ deskAct($.data.desk.state, $trigger) }}')]),
        fs: answer('fs', [set('$.data.fs', '{{ fsAct($.data.fs, $trigger, now()) }}')]),
        open: answer('open', [
            set('$.data.notes', '{{ notesLoad($.data.notes, $.data.fs.items, $trigger) }}'),
            set('$.data.viewer', '{{ viewerLoad($.data.viewer, $.data.fs.items, $trigger) }}'),
            set('$.data.fs', '{{ fsEnter($.data.fs, $trigger) }}'),
            set(input('desk'), '{{ fsOpenCommand($.data.fs.items, $trigger) }}')
        ]),
        note: answer('note', [
            set('$.data.fs', '{{ fsSaveNote($.data.fs, $.data.notes, now(), $trigger) }}'),
            set('$.data.notes', '{{ notesSaved($.data.fs, $.data.notes, $trigger) }}')
        ]),
        picture: answer('picture', [set('$.data.fs', '{{ fsSavePicture($.data.fs, $.data.paint.picture, $.data.paint.name, now(), $trigger) }}')]),
        folder: {
            when: { path: '$.data.fs.folder' },
            do: [set('$.data.fs.listing', '{{ fsListing($.data.fs.items, $trigger) }}'), set('$.data.fs.path', '{{ fsPath($.data.fs.items, $trigger) }}')]
        },
        upload: {
            when: { path: '$.data.upload' },
            do: [set('$.data.fs', '{{ fsUpload($.data.fs, $trigger, now()) }}')]
        },
        wallpaper: {
            when: { path: '$.data.desk.prefs.wallpaper' },
            do: [set('$.data.desk.paints', '{{ deskWallpaper($trigger) }}')]
        },
        ridgelinePick: ridgelineRules['ridgelinePick'],
        ridgelineMove: ridgelineRules['ridgelineMove'],
        ridgelineNew: ridgelineRules['ridgelineNew']
    },
    tables: { ridgelineStatus: northwindLogic.tables.ridgelineStatus }
};

/** The data of a fresh desktop; `bootstrap.ts` puts the saved items and preferences over it */
export function deskData(saved: { items?: unknown; nextId?: unknown; prefs?: { wallpaper?: unknown; dark?: unknown } } = {}): Json {
    const wallpaper = typeof saved.prefs?.wallpaper === 'string' ? saved.prefs.wallpaper : 'dawn';
    return {
        input: { desk: '', fs: '', open: '', note: '', picture: '' },
        desk: {
            state: START,
            prefs: { wallpaper, dark: saved.prefs?.dark === true },
            paints: deskWallpaper(wallpaper),
            clock: '',
            storage: ''
        },
        fs: fsView({ items: Array.isArray(saved.items) ? saved.items : seedItems(''), nextId: typeof saved.nextId === 'number' ? saved.nextId : 1, folder: 'home' }),
        upload: [],
        notes: { id: '', name: 'Untitled.md', text: '' },
        paint: { picture: {}, name: 'Drawing' },
        viewer: viewerLoad(null, [], ''),
        game: emptyGame()
    };
}

/** The height of the desktop surface: the viewport less the taskbar */
export const SURFACE_HEIGHT = 'calc(100dvh - 60px)';

/** The whole document, with the data of `deskData` and the surface `surfaceHeight` tall */
export function desktopDocument(data: Json = deskData(), surfaceHeight: string = SURFACE_HEIGHT): AppDocument {
    return {
        locale: 'en',
        theme: { active: { mode: 'light', brand: 'default', motion: 'full' } },
        data,
        app: APP,
        start: 'desk',
        screens: { desk: { root: screen(surfaceHeight) } },
        logic: DESK_LOGIC
    } as unknown as AppDocument;
}

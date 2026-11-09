/**
 * The Lumen desktop in a real browser: windows open, stack, minimize, snap and close through their buttons; the file
 * system works through the Files window; notes, uploads and pictures are kept in OPFS across a restart. Each test
 * gets its own OPFS folder and removes it afterwards
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startDesktop } from '../src/desktop/bootstrap.ts';
import type { RunningDesktop } from '../src/desktop/bootstrap.ts';
import { DESK_PATHS } from '../src/desktop/document.ts';
import type { AppId, FsItem } from '../src/desktop/desk.ts';

const SURFACE = `${DESK_PATHS.surface}.children`;
const FILES = `${SURFACE}.files.children`;
const NOTES = `${SURFACE}.notes.children`;
const PAINT = `${SURFACE}.paint.children`;
const TASKS = `${DESK_PATHS.taskbar}.children.tasks.children`;

let host: HTMLElement;
let desk: RunningDesktop;
let folder: string;
let runs = 0;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function until(check: () => boolean, timeout = 3000): Promise<void> {
    const end = performance.now() + timeout;
    while (!check()) {
        if (performance.now() > end) throw new Error('condition not met in time');
        await wait(16);
    }
}

const start = async (): Promise<RunningDesktop> => {
    const running = await startDesktop(host, { folder, saveDelay: 10, surfaceHeight: '820px' });
    await frame();
    return running;
};

/** Stops the desktop and starts it again on the same OPFS folder, as a reload does */
async function restart(): Promise<void> {
    await desk.flush();
    desk.dispose();
    host.replaceChildren();
    desk = await start();
}

function elementAt(path: string): HTMLElement {
    const element = desk.elementAt(path);
    if (!element) throw new Error(`nothing rendered at ${path}`);
    return element;
}

function press(path: string): void {
    const element = elementAt(path);
    const control = element.shadowRoot?.querySelector<HTMLElement>('button, [role="menuitem"], [role="button"]') ?? element;
    control.click();
}

/** Presses a window's frame button: snapLeft, snapRight, minimize, maximize or close */
const pressFrame = (app: AppId, button: string): void => press(`${SURFACE}.${app}.actions.children.${button}`);

function typeInto(path: string, value: string): void {
    const input = elementAt(path).shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (!input) throw new Error(`no input at ${path}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

const shown = (app: AppId): boolean => {
    const element = elementAt(`${SURFACE}.${app}`);
    return element.checkVisibility() && element.getBoundingClientRect().height > 0;
};
/** The box of the surface's layout: the wallpaper fills it from its origin */
const origin = (): DOMRect => elementAt(`${SURFACE}.wallpaper`).getBoundingClientRect();
const zOf = (app: AppId): number => Number(getComputedStyle(elementAt(`${SURFACE}.${app}`)).zIndex);
const items = (): FsItem[] => desk.store.get<FsItem[]>('$.data.fs.items');
const named = (name: string): FsItem | undefined => items().find((item) => item.name === name);
const runErrors = (): string[] => desk.errors.map((error) => `${error.code} ${error.message}`);

async function openApp(app: AppId): Promise<void> {
    press(`${SURFACE}.icon_${app}`);
    await until(() => shown(app));
}

/** A small PNG made on a canvas */
async function pngFile(name: string): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.fillStyle = '#e4572e';
    context.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value as Blob), 'image/png'));
    return new File([blob], name, { type: 'image/png' });
}

beforeEach(async () => {
    host = document.createElement('div');
    host.style.inlineSize = '1400px';
    document.body.append(host);
    folder = `lumen-test-${Date.now()}-${runs++}`;
    desk = await start();
});

afterEach(async () => {
    desk.dispose();
    host.remove();
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(folder, { recursive: true }).catch(() => undefined);
});

describe('Lumen desktop', () => {
    it('should mount without errors, keep its files in OPFS and fill the surface with the wallpaper', async () => {
        // Arrange: mounted in beforeEach
        const wallpaper = elementAt(`${SURFACE}.wallpaper`).getBoundingClientRect();

        // Assert
        expect(runErrors()).toEqual([]);
        expect(desk.files.kind).toBe('opfs');
        expect(wallpaper.height).toBeGreaterThan(800);
        for (const app of ['files', 'notes', 'paint', 'viewer', 'ridgeline', 'settings'] as const) expect(shown(app)).toBe(false);
        expect(desk.store.get('$.data.desk.clock')).not.toBe('');
    });

    it('should open a window from its desktop icon, placed and with a taskbar button', async () => {
        // Act
        await openApp('files');

        // Assert
        const box = elementAt(`${SURFACE}.files`).getBoundingClientRect();
        const surface = origin();
        expect(Math.round(box.left - surface.left)).toBe(150);
        expect(Math.round(box.width)).toBe(720);
        expect(elementAt(`${TASKS}.files`).checkVisibility()).toBe(true);
        expect(elementAt(`${TASKS}.notes`).checkVisibility()).toBe(false);
    });

    it('should bring a window to the front when it is pressed', async () => {
        // Arrange
        await openApp('files');
        await openApp('notes');
        expect(zOf('notes')).toBeGreaterThan(zOf('files'));

        // Act
        elementAt(`${SURFACE}.files`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
        await until(() => zOf('files') > zOf('notes'));

        // Assert
        expect(desk.store.get('$.data.desk.state.active')).toBe('files');
    });

    it('should minimize a window and restore it from the taskbar', async () => {
        // Arrange
        await openApp('settings');

        // Act
        pressFrame('settings', 'minimize');
        await until(() => !shown('settings'));
        press(`${TASKS}.settings`);
        await until(() => shown('settings'));

        // Assert
        expect(desk.store.get('$.data.desk.state.active')).toBe('settings');
    });

    it('should snap a window to a half and maximize it', async () => {
        // Arrange
        await openApp('notes');
        const surface = origin();
        const box = (): DOMRect => elementAt(`${SURFACE}.notes`).getBoundingClientRect();

        // Act and Assert
        pressFrame('notes', 'snapRight');
        await until(() => Math.round(box().left - surface.left) === Math.round(surface.width / 2));
        expect(Math.round(box().width)).toBe(Math.round(surface.width / 2));

        pressFrame('notes', 'maximize');
        await until(() => Math.round(box().width) === Math.round(surface.width));
        expect(Math.round(box().height)).toBe(Math.round(surface.height));

        pressFrame('notes', 'maximize');
        await until(() => Math.round(box().width) === 760);
    });

    it('should close a window and its taskbar button', async () => {
        // Arrange
        await openApp('viewer');

        // Act
        pressFrame('viewer', 'close');
        await until(() => !shown('viewer'));

        // Assert
        expect(elementAt(`${TASKS}.viewer`).checkVisibility()).toBe(false);
    });

    it('should make, rename and delete a folder in Files', async () => {
        // Arrange
        await openApp('files');

        // Act: make
        typeInto(`${FILES}.edit.children.name`, 'Projects');
        press(`${FILES}.edit.children.newFolder`);
        await until(() => named('Projects') !== undefined);

        // Act: rename (the new folder is selected)
        typeInto(`${FILES}.edit.children.name`, 'Work');
        press(`${FILES}.edit.children.rename`);
        await until(() => named('Work') !== undefined);

        // Act: delete through the confirm dialog
        press(`${FILES}.edit.children.remove`);
        await frame();
        press(`${FILES}.confirm.footer.children.confirm`);
        await until(() => named('Work') === undefined);

        // Assert
        expect(desk.store.get<{ name: string }[]>('$.data.fs.listing').map((row) => row.name)).toEqual(['Documents', 'Pictures']);
        expect(runErrors()).toEqual([]);
    });

    it('should open a note from Files, save an edit and keep it after a restart', async () => {
        // Arrange
        await openApp('files');
        desk.store.set('$.data.fs.folder', 'documents');
        desk.store.set('$.data.fs.selected', 'welcome');

        // Act
        press(`${FILES}.bar.children.open`);
        await until(() => shown('notes') && desk.store.get('$.data.notes.id') === 'welcome');
        typeInto(`${NOTES}.split.children.text`, '# Shopping\n\n- tea');
        press(`${NOTES}.bar.children.save`);
        await until(() => named('Welcome.md')?.text === '# Shopping\n\n- tea');
        await restart();

        // Assert
        expect(named('Welcome.md')?.text).toBe('# Shopping\n\n- tea');
    });

    it('should store an upload in OPFS and read it back after a restart', async () => {
        // Arrange
        await openApp('files');
        const file = await pngFile('photo.png');
        const input = elementAt(`${FILES}.upload`).shadowRoot?.querySelector<HTMLInputElement>('input[type=file]');
        if (!input) throw new Error('no file input');
        const transfer = new DataTransfer();
        transfer.items.add(file);

        // Act
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        await until(() => named('photo.png') !== undefined);
        await restart();

        // Assert
        const stored = named('photo.png');
        expect(stored).toMatchObject({ kind: 'picture', parent: 'home' });
        const read = await desk.files.readFile(stored?.file?.id as string);
        expect(read.data.byteLength).toBe(file.size);
        expect(read.file.type).toBe('image/png');
    });

    it('should save a Paint picture into Pictures and show it in the Viewer', async () => {
        // Arrange: a drawing, as paintField hands it to the file store
        await openApp('paint');
        const picture = await desk.files.transferFile(await pngFile('Picture.png'));
        desk.store.set('$.data.paint.picture', picture as never);
        typeInto(`${PAINT}.bar.children.name`, 'Sunset');

        // Act
        press(`${PAINT}.bar.children.save`);
        await until(() => named('Sunset.png') !== undefined);
        desk.store.set('$.data.input.open', (named('Sunset.png') as FsItem).id);
        await until(() => shown('viewer'));

        // Assert
        expect(named('Sunset.png')).toMatchObject({ parent: 'pictures', file: picture });
        expect(desk.store.get('$.data.viewer.name')).toBe('Sunset.png');
        expect(desk.store.get('$.data.desk.state.active')).toBe('viewer');
        expect(runErrors()).toEqual([]);
    });

    it('should keep the wallpaper and dark mode across a restart', async () => {
        // Arrange
        await openApp('settings');

        // Act
        desk.store.set('$.data.desk.prefs.wallpaper', 'meadow');
        desk.store.set('$.data.desk.prefs.dark', true);
        await until(() => desk.store.get('$.theme.active.mode') === 'dark');
        await restart();

        // Assert
        expect(desk.store.get('$.data.desk.prefs')).toEqual({ wallpaper: 'meadow', dark: true });
        expect(desk.store.get('$.theme.active.mode')).toBe('dark');
        expect(JSON.stringify(desk.store.get('$.data.desk.paints'))).toContain('#7cc6e8');
    });
});

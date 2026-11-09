/**
 * The pure functions of the Lumen desktop (src/desktop/desk.ts): the window manager and the file system
 */
import { describe, expect, it } from 'vitest';
import {
    APPS,
    deskAct,
    deskWallpaper,
    emptyDesk,
    fsAct,
    fsEnter,
    fsFolders,
    fsListing,
    fsOpenCommand,
    fsPath,
    fsPick,
    fsSaveNote,
    fsSavePicture,
    fsUpload,
    fsView,
    notesLoad,
    notesSaved,
    seedItems,
    viewerLoad
} from '../src/desktop/desk.ts';
import type { Desk, Fs, FsItem } from '../src/desktop/desk.ts';

const NOW = '2026-11-08T12:00:00.000Z';

/** Applies window commands in order */
const run = (...commands: string[]): Desk => commands.reduce<Desk>((desk, command) => deskAct(desk, command), emptyDesk());

const fresh = (): Fs => fsView({ items: seedItems(NOW), nextId: 1, folder: 'home' });
const item = (fs: Fs, id: string): FsItem | undefined => fs.items.find((other) => other.id === id);
const png = { id: 'f1', name: 'Picture.png', size: 2048, type: 'image/png' };

describe('deskAct', () => {
    it('should start with every window closed and no taskbar button', () => {
        // Arrange and Act
        const desk = emptyDesk();

        // Assert
        expect(desk.active).toBe('');
        for (const app of APPS) {
            expect(desk.hidden[app]).toBe(true);
            expect(desk.taskbar[app].hidden).toBe(true);
            expect(desk.windows[app].z).toBe(0);
        }
    });

    it('should open a window in front, with its free placement and a taskbar button', () => {
        // Arrange and Act
        const desk = run('open files', 'open notes');

        // Assert
        expect(desk.active).toBe('notes');
        expect(desk.hidden.files).toBe(false);
        expect(desk.windows.files.z).toBe(1);
        expect(desk.windows.notes.z).toBe(2);
        expect(desk.placement.files).toEqual({ x: '150px', y: '28px', width: '720px', height: '500px', z: 1 });
        expect(desk.taskbar.notes).toEqual({ hidden: false, variant: 'soft' });
        expect(desk.taskbar.files).toEqual({ hidden: false, variant: 'ghost' });
    });

    it('should bring a focused window to the front and keep z small', () => {
        // Arrange
        let desk = run('open files', 'open notes', 'open paint');

        // Act
        for (let n = 0; n < 20; n++) desk = deskAct(desk, n % 2 === 0 ? 'focus files' : 'focus notes');

        // Assert
        expect(desk.active).toBe('notes');
        expect([desk.windows.paint.z, desk.windows.files.z, desk.windows.notes.z]).toEqual([1, 2, 3]);
    });

    it('should not open a window on focus', () => {
        // Arrange and Act
        const desk = run('focus settings');

        // Assert
        expect(desk.windows.settings.open).toBe(false);
    });

    it('should minimize a window, give the front to the next one and restore it from the taskbar', () => {
        // Arrange
        const open = run('open files', 'open notes');

        // Act
        const minimized = deskAct(open, 'minimize notes');
        const restored = deskAct(minimized, 'task notes');

        // Assert
        expect(minimized.hidden.notes).toBe(true);
        expect(minimized.taskbar.notes.hidden).toBe(false);
        expect(minimized.active).toBe('files');
        expect(restored.hidden.notes).toBe(false);
        expect(restored.active).toBe('notes');
    });

    it('should minimize the front window from its taskbar button and raise a window behind', () => {
        // Arrange
        const open = run('open files', 'open notes');

        // Act
        const front = deskAct(open, 'task notes');
        const behind = deskAct(open, 'task files');

        // Assert
        expect(front.hidden.notes).toBe(true);
        expect(behind.active).toBe('files');
        expect(behind.hidden.files).toBe(false);
    });

    it.each([
        ['left', { x: '0px', y: '0px', width: '50%', height: '100%' }],
        ['right', { x: '50%', y: '0px', width: '50%', height: '100%' }],
        ['max', { x: '0px', y: '0px', width: '100%', height: '100%' }]
    ])('should snap a window %s', (snap, placement) => {
        // Arrange and Act
        const desk = run('open files', `snap files ${snap}`);

        // Assert
        expect(desk.placement.files).toEqual({ ...placement, z: 1 });
    });

    it('should toggle maximize and go back to the free geometry', () => {
        // Arrange and Act
        const max = run('open paint', 'maximize paint');
        const free = deskAct(max, 'maximize paint');

        // Assert
        expect(max.windows.paint.snap).toBe('max');
        expect(free.placement.paint).toEqual({ x: '270px', y: '24px', width: '640px', height: '640px', z: 1 });
    });

    it('should close a window, reset it and renumber the others', () => {
        // Arrange and Act
        const desk = run('open files', 'snap files left', 'open notes', 'open paint', 'close files');

        // Assert
        expect(desk.windows.files).toMatchObject({ open: false, snap: 'free', z: 0 });
        expect(desk.taskbar.files.hidden).toBe(true);
        expect([desk.windows.notes.z, desk.windows.paint.z]).toEqual([1, 2]);
    });

    it.each(['', 'open', 'open nothing', 'fly files', 'snap files diagonal', 42])('should leave the desk as it is for %j', (command) => {
        // Arrange
        const desk = run('open files');

        // Act
        const next = deskAct(desk, command);

        // Assert
        expect(next).toEqual(desk);
    });

    it('should read a missing desk as an empty one', () => {
        // Arrange and Act
        const desk = deskAct(undefined, 'open settings');

        // Assert
        expect(desk.active).toBe('settings');
    });
});

describe('the file system', () => {
    it('should list a folder with folders first, by name, with a detail line', () => {
        // Arrange
        const items: FsItem[] = [
            ...seedItems(NOW),
            { id: 'b', name: 'b.md', parent: 'home', kind: 'note', text: 'one', modified: NOW },
            { id: 'a', name: 'a.png', parent: 'home', kind: 'picture', file: png, modified: NOW }
        ];

        // Act
        const rows = fsListing(items, 'home');

        // Assert
        expect(rows.map((row) => row.name)).toEqual(['Documents', 'Pictures', 'a.png', 'b.md']);
        expect(rows.map((row) => row.detail)).toEqual(['Folder, 1 item', 'Folder, 0 items', 'Picture, 2 KB', 'Note, 1 word']);
        expect(rows[0]?.icon).toBe('folder');
    });

    it('should make a folder tree and a path', () => {
        // Arrange
        const items = seedItems(NOW);

        // Act
        const tree = fsFolders(items);
        const path = fsPath(items, ['documents']);

        // Assert
        expect(tree.find((node) => node.id === 'home')).toEqual({ id: 'home', parentId: null, label: 'Home', hasChildren: true });
        expect(tree.find((node) => node.id === 'documents')?.parentId).toBe('home');
        expect(path).toBe('Home / Documents');
    });

    it('should make a folder and a note in the open folder with free names', () => {
        // Arrange
        let fs = { ...fresh(), name: 'Plans' };

        // Act
        fs = fsAct(fs, 'newFolder', NOW);
        fs = fsAct({ ...fs, name: 'Plans' }, 'newFolder', NOW);
        fs = fsAct(fs, 'newNote', NOW);

        // Assert
        expect(fs.listing.map((row) => row.name)).toEqual(['Documents', 'Pictures', 'Plans', 'Plans 2', 'Untitled.md']);
        expect(item(fs, 'i3')).toMatchObject({ kind: 'note', parent: 'home', text: '', modified: NOW });
        expect(fs.selected).toBe('i3');
        expect(fs.name).toBe('');
        expect(fs.nextId).toBe(4);
    });

    it('should rename the selected item to the name field, but never the home folder', () => {
        // Arrange
        const fs = { ...fresh(), folder: 'documents', selected: 'welcome', name: 'Hello.md' };

        // Act
        const renamed = fsAct(fs, 'rename', NOW);
        const home = fsAct({ ...fresh(), selected: 'home', name: 'Root' }, 'rename', NOW);

        // Assert
        expect(item(renamed, 'welcome')?.name).toBe('Hello.md');
        expect(item(home, 'home')?.name).toBe('Home');
    });

    it('should delete the selected item with everything below it', () => {
        // Arrange
        const fs = { ...fresh(), selected: 'documents' };

        // Act
        const next = fsAct(fs, 'delete', NOW);

        // Assert
        expect(next.items.map((other) => other.id)).toEqual(['home', 'pictures']);
        expect(next.selected).toBe('');
    });

    it('should not delete the home folder', () => {
        // Arrange and Act
        const next = fsAct({ ...fresh(), selected: 'home' }, 'delete', NOW);

        // Assert
        expect(next.items).toHaveLength(4);
    });

    it('should go up a folder and select the folder it left', () => {
        // Arrange and Act
        const next = fsAct({ ...fresh(), folder: 'documents' }, 'up', NOW);

        // Assert
        expect(next.folder).toBe('home');
        expect(next.selected).toBe('documents');
        expect(next.path).toBe('Home');
    });

    it('should enter a folder and select a file', () => {
        // Arrange and Act
        const folder = fsEnter(fresh(), 'documents');
        const note = fsEnter(folder, ['welcome']);

        // Assert
        expect(folder.folder).toBe('documents');
        expect(folder.listing.map((row) => row.id)).toEqual(['welcome']);
        expect(note.selected).toBe('welcome');
        expect(note.folder).toBe('documents');
    });

    it('should pick the selected item for an open of "selected" and an id otherwise', () => {
        // Arrange and Act and Assert
        expect(fsPick('selected', 'welcome')).toBe('welcome');
        expect(fsPick('selected', ['p'])).toBe('p');
        expect(fsPick('documents', 'welcome')).toBe('documents');
        expect(fsPick('', 'welcome')).toBe('');
    });

    it('should open notes in Notes and pictures in the Viewer', () => {
        // Arrange
        const items: FsItem[] = [
            ...seedItems(NOW),
            { id: 'p', name: 'p.png', parent: 'pictures', kind: 'picture', file: png, modified: NOW },
            { id: 'z', name: 'z.zip', parent: 'home', kind: 'file', file: { ...png, type: 'application/zip' }, modified: NOW }
        ];

        // Act and Assert
        expect(fsOpenCommand(items, 'welcome')).toBe('open notes');
        expect(fsOpenCommand(items, 'p')).toBe('open viewer');
        expect(fsOpenCommand(items, 'z')).toBe('');
        expect(fsOpenCommand(items, 'documents')).toBe('');
        expect(notesLoad(undefined, items, 'welcome')).toMatchObject({ id: 'welcome', name: 'Welcome.md' });
        expect(viewerLoad(undefined, items, 'p')).toEqual({ id: 'p', name: 'p.png', file: png, empty: false, has: true });
        expect(viewerLoad(undefined, items, 'welcome')).toMatchObject({ file: null, empty: true, has: false });
    });

    it('should save a new note into Documents and then edit that note', () => {
        // Arrange
        const draft = { id: '', name: 'Ideas', text: '# Ideas' };

        // Act
        const saved = fsSaveNote(fresh(), draft, NOW, 'save');
        const editor = notesSaved(saved, draft, 'save');
        const again = fsSaveNote(saved, { ...editor, text: '# More ideas' }, NOW, 'save');

        // Assert
        expect(item(saved, 'i1')).toMatchObject({ name: 'Ideas.md', parent: 'documents', text: '# Ideas' });
        expect(editor).toEqual({ id: 'i1', name: 'Ideas.md', text: '# Ideas' });
        expect(again.items).toHaveLength(5);
        expect(item(again, 'i1')?.text).toBe('# More ideas');
    });

    it('should change nothing when the save input is cleared', () => {
        // Arrange
        const draft = { id: '', name: 'Ideas', text: 'x' };

        // Act
        const fs = fsSaveNote(fresh(), draft, NOW, '');
        const picture = fsSavePicture(fresh(), png, 'Sky', NOW, '');

        // Assert
        expect(fs.items).toHaveLength(4);
        expect(picture.items).toHaveLength(4);
        expect(notesSaved(fresh(), draft, '')).toEqual(draft);
    });

    it('should save a picture into Pictures, and nothing when nothing is drawn', () => {
        // Arrange and Act
        const saved = fsSavePicture(fresh(), png, 'Sky', NOW, 'save');
        const twice = fsSavePicture(saved, png, 'Sky', NOW, 'save');
        const blank = fsSavePicture(fresh(), {}, 'Sky', NOW, 'save');

        // Assert
        expect(item(saved, 'i1')).toMatchObject({ name: 'Sky.png', parent: 'pictures', kind: 'picture', file: png });
        expect(saved.last).toBe('i1');
        expect(item(twice, 'i2')?.name).toBe('Sky 2.png');
        expect(blank.items).toHaveLength(4);
    });

    it('should add uploads to the open folder, pictures for images', () => {
        // Arrange
        const zip = { id: 'f2', name: 'data.zip', size: 10, type: 'application/zip' };

        // Act
        const fs = fsUpload({ ...fresh(), folder: 'documents' }, [png, zip, { name: 'no id' }], NOW);

        // Assert
        expect(fs.listing.map((row) => row.name)).toEqual(['data.zip', 'Picture.png', 'Welcome.md']);
        expect(item(fs, 'i1')?.kind).toBe('picture');
        expect(item(fs, 'i2')?.kind).toBe('file');
        expect(fs.selected).toBe('i2');
    });
});

describe('deskWallpaper', () => {
    it.each(['dawn', 'dusk', 'meadow'])('should paint the %s sky, glow and hills', (name) => {
        // Arrange and Act
        const paints = deskWallpaper(name);

        // Assert
        expect(Object.keys(paints)).toEqual(['sky', 'glow', 'far', 'near']);
        expect(paints['sky']?.kind).toBe('linear');
        expect(paints['glow']?.kind).toBe('radial');
    });

    it('should fall back to dawn for an unknown name', () => {
        // Arrange and Act and Assert
        expect(deskWallpaper('neon')).toEqual(deskWallpaper('dawn'));
    });
});

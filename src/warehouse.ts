/**
 * The files of the Warehouse section and the two hooks that serve them: `readFile` gives a stored file to the components
 * that show one (the dock picture of the floor plan, the pallet model of the 3D view), and `load3d` loads the 3D
 * renderer only when a `scene3d` first asks for it. The files ship with the app; their references in `main.json` name
 * them by id, as references to files of a file store would
 */
import { FileTransferError } from '@punyts/stateui-app';
import type { FileData, Load3d, ReadFile } from '@punyts/stateui-app';
import dockUrl from './assets/dock.png?url';
import palletUrl from './assets/pallet.glb?url';

interface ShippedFile {
    readonly name: string;
    readonly type: string;
    readonly url: string;
}

/** The shipped files by the id their reference in the document carries */
export const WAREHOUSE_FILES: Readonly<Record<string, ShippedFile>> = {
    '276bf28c-5ab5-4f6f-8a4d-0491b2a8c5c0': { name: 'dock.png', type: 'image/png', url: dockUrl },
    '506bb081-ff8e-46b9-987c-2ee81991da1e': { name: 'pallet.glb', type: 'model/gltf-binary', url: palletUrl }
};

/** Reads a shipped file by its id; an unknown id is `not_found` */
export const readFile: ReadFile = async (id, options = {}) => {
    const shipped = WAREHOUSE_FILES[id];
    if (shipped === undefined) throw new FileTransferError('not_found', `No file ${id}`);
    let response: Response;
    try {
        response = await fetch(shipped.url, { signal: options.signal ?? null });
    } catch (error) {
        if (options.signal?.aborted) throw new FileTransferError('cancelled', 'The read was cancelled');
        throw new FileTransferError('offline', error instanceof Error ? error.message : 'The file could not be read');
    }
    if (!response.ok) throw new FileTransferError('not_found', `${shipped.name} answered ${response.status}`);
    const data = await response.arrayBuffer();
    const file: FileData['file'] = { id, name: shipped.name, size: data.byteLength, type: shipped.type };
    return { file, data };
};

let renderer: ReturnType<Load3d> | undefined;

/** Loads the 3D renderer (three.js and the scene code) as its own chunk, once */
export const load3d: Load3d = () => {
    renderer ??= import('@punyts/stateui-3d').then(({ VERSION, createScene3d }) => ({ version: VERSION, createScene3d }));
    return renderer;
};

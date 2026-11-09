/**
 * The file store of the Lumen desktop. Bytes live in the Origin Private File System (OPFS): a folder per desktop
 * (`lumen` by default) with one file per stored file, named by its id, and `desk.json` with the item records and the
 * preferences. Without OPFS (an old browser, a private window that refuses it) the store keeps everything in memory for
 * the life of the page.
 *
 * `transferFile` and `readFile` are the StateUI hooks: `fileField` and `paintField` hand their files to the first,
 * `drawImage` (the Viewer) reads them back with the second.
 */
import { FileTransferError } from '@punyts/stateui-app';
import type { FileData, ReadFile, TransferFile } from '@punyts/stateui-app';

/** The largest file the desktop stores */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const META = 'desk.json';
const TYPES = 'types.json';

export interface FileStore {
    /** `opfs` or `memory` */
    readonly kind: 'opfs' | 'memory';
    readonly transferFile: TransferFile;
    readonly readFile: ReadFile;
    /** Reads `desk.json`, or undefined when there is none yet */
    loadMeta(): Promise<unknown>;
    /** Writes `desk.json` */
    saveMeta(value: unknown): Promise<void>;
    /** Removes every file and `desk.json` (tests, and a reset) */
    clear(): Promise<void>;
}

interface Backend {
    write(name: string, data: ArrayBuffer | string): Promise<void>;
    read(name: string): Promise<ArrayBuffer | undefined>;
    clear(): Promise<void>;
}

function memoryBackend(): Backend {
    const files = new Map<string, ArrayBuffer>();
    return {
        async write(name, data) {
            files.set(name, typeof data === 'string' ? (new TextEncoder().encode(data).buffer as ArrayBuffer) : data.slice(0));
        },
        async read(name) {
            return files.get(name)?.slice(0);
        },
        async clear() {
            files.clear();
        }
    };
}

async function opfsBackend(folder: string): Promise<Backend | undefined> {
    try {
        if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') return undefined;
        const root = await navigator.storage.getDirectory();
        let dir = await root.getDirectoryHandle(folder, { create: true });
        // A probe write: some browsers expose OPFS but refuse writable streams (Safari in a worker-less page)
        const probe = await dir.getFileHandle('.probe', { create: true });
        const stream = await probe.createWritable();
        await stream.write('ok');
        await stream.close();
        return {
            async write(name, data) {
                const handle = await dir.getFileHandle(name, { create: true });
                const writable = await handle.createWritable();
                await writable.write(data);
                await writable.close();
            },
            async read(name) {
                try {
                    const handle = await dir.getFileHandle(name);
                    return await (await handle.getFile()).arrayBuffer();
                } catch {
                    return undefined;
                }
            },
            async clear() {
                await root.removeEntry(folder, { recursive: true });
                dir = await root.getDirectoryHandle(folder, { create: true });
            }
        };
    } catch {
        return undefined;
    }
}

/** A file id: random, so two tabs never collide */
const newId = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export interface FileStoreOptions {
    /** The OPFS folder; tests use their own */
    folder?: string;
    /** Keep everything in memory even when OPFS is there */
    memory?: boolean;
}

/** Opens the file store: OPFS when the browser has it, else memory */
export async function openFileStore(options: FileStoreOptions = {}): Promise<FileStore> {
    let backend = options.memory === true ? undefined : await opfsBackend(options.folder ?? 'lumen');
    const kind = backend === undefined ? 'memory' : 'opfs';
    backend ??= memoryBackend();
    const store = backend;

    // The name and type of each stored file, so `readFile` can answer with a full reference
    let types: Record<string, { name: string; type: string }> = {};
    const saved = await store.read(TYPES);
    if (saved !== undefined) {
        try {
            types = JSON.parse(new TextDecoder().decode(saved)) as typeof types;
        } catch {
            types = {};
        }
    }

    const transferFile: TransferFile = async (file, options = {}) => {
        if (file.size > MAX_FILE_BYTES) throw new FileTransferError('too_large', 'The file is larger than 10 MB');
        if (options.signal?.aborted) throw new FileTransferError('cancelled', 'The upload was cancelled');
        const data = await file.arrayBuffer();
        const id = newId();
        try {
            await store.write(id, data);
        } catch (error) {
            const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
            throw new FileTransferError(quota ? 'quota' : 'offline', error instanceof Error ? error.message : 'The file could not be stored');
        }
        types = { ...types, [id]: { name: file.name, type: file.type } };
        await store.write(TYPES, JSON.stringify(types));
        options.onProgress?.({ loaded: file.size, total: file.size });
        return { id, name: file.name, size: file.size, type: file.type };
    };

    const readFile: ReadFile = async (id, options = {}) => {
        if (options.signal?.aborted) throw new FileTransferError('cancelled', 'The read was cancelled');
        const data = await store.read(id);
        if (data === undefined) throw new FileTransferError('not_found', `No file ${id}`);
        const known = types[id] ?? { name: id, type: 'application/octet-stream' };
        const file: FileData['file'] = { id, name: known.name, size: data.byteLength, type: known.type };
        return { file, data };
    };

    return {
        kind,
        transferFile,
        readFile,
        async loadMeta() {
            const data = await store.read(META);
            if (data === undefined) return undefined;
            try {
                return JSON.parse(new TextDecoder().decode(data)) as unknown;
            } catch {
                return undefined;
            }
        },
        async saveMeta(value) {
            await store.write(META, JSON.stringify(value));
        },
        async clear() {
            types = {};
            await store.clear();
        }
    };
}

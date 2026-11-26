/**
 * Finds a node of a document by its id, as `#name` does: a node's id is its `@id`, otherwise its key. Code that
 * writes a node's own state (`hidden`, a look) asks for the node's path by id instead of spelling out where the node
 * sits, so the node can move without the code changing
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNode = (value: unknown): value is Json => isObject(value) && typeof value['component'] === 'string';

/** Every node at or below `node` whose id is `id`: the entries of `children` and the node-valued properties (slots) */
function pathsOfId(node: Json, path: string, key: string, id: string, found: string[]): void {
    const own = node['@id'];
    if ((typeof own === 'string' ? own : key) === id) found.push(path);
    for (const [property, value] of Object.entries(node)) {
        if (isNode(value)) pathsOfId(value, `${path}.${property}`, property, id, found);
        else if (property === 'children' && isObject(value)) {
            for (const [child, item] of Object.entries(value)) {
                if (isNode(item)) pathsOfId(item, `${path}.children.${child}`, child, id, found);
            }
        }
    }
}

/**
 * The state path of the one node at or below `root` whose id is `id`, where `rootPath` is the state path of `root`
 * (`$.screens.main` for a screen's root). Undefined when no node has the id or several do
 */
export function pathOfId(root: unknown, rootPath: string, id: string): string | undefined {
    if (!isNode(root)) return undefined;
    const found: string[] = [];
    pathsOfId(root, rootPath, rootPath.slice(rootPath.lastIndexOf('.') + 1), id, found);
    return found.length === 1 ? found[0] : undefined;
}

/** `pathOfId` for a node the document must have: throws when the id names no node or several */
export function requirePathOfId(root: unknown, rootPath: string, id: string): string {
    const path = pathOfId(root, rootPath, id);
    if (path === undefined) throw new Error(`Not exactly one node below ${rootPath} has the id "${id}"`);
    return path;
}

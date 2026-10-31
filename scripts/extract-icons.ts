/**
 * Writes src/icons.json: the path data of every icon the app document names that is not in the library's compiled core
 * set. bootstrap.ts puts it into `$.runtime.icons` before the first render, so the browser never loads the 2 MB
 * icons.json. Run it again after adding an icon to the document:
 *
 *     npm run icons
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CORE_ICON_NAMES, ICON_ALIASES } from '@punyts/stateui-components';
import type { IconsFile } from '@punyts/stateui-components';

const iconsPath = fileURLToPath(import.meta.resolve('@punyts/stateui-components/icons.json'));
const appPath = fileURLToPath(new URL('../src/document/app.json', import.meta.url));
const outPath = fileURLToPath(new URL('../src/icons.json', import.meta.url));

const file = JSON.parse(readFileSync(iconsPath, 'utf8')) as IconsFile;
const app: unknown = JSON.parse(readFileSync(appPath, 'utf8'));

/** Every value of an `icon` or (icon component) `name` key in the tree */
function collect(value: unknown, names: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) collect(item, names);
        return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (typeof node['icon'] === 'string' && node['icon'] !== '') names.add(node['icon']);
    if (node['component'] === 'icon' && typeof node['name'] === 'string') names.add(node['name']);
    for (const child of Object.values(node)) collect(child, names);
}

const names = new Set<string>();
collect(app, names);
const core = new Set(CORE_ICON_NAMES);
const aliases = ICON_ALIASES as Readonly<Record<string, string>>;
const out: Record<string, { outline: readonly unknown[]; filled?: readonly unknown[] }> = {};
for (const name of [...names].sort()) {
    if (core.has(name)) continue;
    const entry = file.icons[name] ?? file.icons[aliases[name] ?? ''];
    if (!entry) {
        console.error(`unknown icon: ${name}`);
        process.exitCode = 1;
        continue;
    }
    out[name] = entry.filled ? { outline: entry.outline, filled: entry.filled } : { outline: entry.outline };
}
writeFileSync(outPath, `${JSON.stringify(out, null, 4)}\n`);
console.log(`icons: wrote ${Object.keys(out).length} icons to src/icons.json`);

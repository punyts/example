import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * The folder of the built component modules, catalog and locale overlays. `import.meta.glob` cannot take a package
 * name, so `src/bootstrap.ts` globs the overlays through this alias, wherever npm put the package
 */
const componentsDist = dirname(require.resolve('@punyts/stateui-components/catalog.json'));

export default defineConfig({
    resolve: {
        alias: { '@stateui-components-dist': componentsDist }
    },
    server: {
        // The @punyts libraries are linked from the workspace above this folder; let the dev server read them
        fs: { allow: [searchForWorkspaceRoot(here), resolve(here, '..'), componentsDist] }
    },
    build: {
        target: 'es2022',
        chunkSizeWarningLimit: 2000,
        // Two pages: Northwind Ops and the Lumen desktop
        rollupOptions: { input: { main: resolve(here, 'index.html'), desktop: resolve(here, 'desktop.html') } }
    }
});

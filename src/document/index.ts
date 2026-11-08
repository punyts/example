/**
 * The Northwind Ops app document, assembled from its parts. Every part is plain JSON: the document is data, and the
 * same object is validated by `scripts/validate.ts` under Node and mounted by `src/bootstrap.ts` in the browser. The
 * app is one screen, `main`: the app node holds the document title and the toasts, and the screen places the header,
 * the menu, the sections and the footer in a region layout
 */
import type { AppDocument } from '@punyts/stateui-app/core';
import app from './app.json' with { type: 'json' };
import data from './data.json' with { type: 'json' };
import de from './locale.de.json' with { type: 'json' };
import main from './main.json' with { type: 'json' };
import mainDe from './main.locale.de.json' with { type: 'json' };

export const appDocument = {
    locale: 'en',
    theme: { active: { mode: 'light', brand: 'default', motion: 'full' } },
    data,
    app,
    start: 'main',
    screens: { main: { root: main, locales: { de: mainDe } } },
    locales: { de }
} as unknown as AppDocument;

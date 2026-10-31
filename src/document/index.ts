/**
 * The Northwind Ops app document, assembled from its parts. Every part is plain JSON: the document is data, and the
 * same object is validated by `scripts/validate.ts` under Node and mounted by `src/bootstrap.ts` in the browser
 */
import type { AppDocument } from '@punyts/stateui-app/core';
import app from './app.json' with { type: 'json' };
import data from './data.json' with { type: 'json' };
import de from './locale.de.json' with { type: 'json' };

export const appDocument = {
    locale: 'en',
    theme: { active: { mode: 'light', brand: 'default', motion: 'full' } },
    data,
    app,
    locales: { de }
} as unknown as AppDocument;

/**
 * Validates the app document without a DOM: `validateDocument` with the component catalog, and the icon names
 * against the library's icons.json. Prints one line per finding and exits 1 on any error (warnings do not fail).
 *
 *     npm run validate
 */
import { libraryFromCatalog, validateDocument } from '@punyts/stateui-app/core';
import type { BuildError } from '@punyts/stateui-app/core';
import { isIconName } from '@punyts/stateui-components';
import catalog from '@punyts/stateui-components/catalog.json' with { type: 'json' };
import { appDocument } from '../src/document/index.ts';
import { generateCustomers } from '../src/data.ts';

const format = (error: BuildError): string =>
    `${error.severity ?? 'error'} ${error.code} ${error.message}${error.statePath ? ` (${error.statePath})` : ''}`;

const library = libraryFromCatalog(catalog as never);
// The customers are part of the mounted document's data (src/bootstrap.ts adds them), so validate them too
const document = { ...appDocument, data: { ...appDocument.data, customers: generateCustomers() } };
const { valid, errors } = validateDocument(document, library, { isIconName });

for (const error of errors) console.log(format(error));
const errorCount = errors.filter((error) => (error.severity ?? 'error') === 'error').length;
const warningCount = errors.length - errorCount;
console.log(`validate: ${valid ? 'valid' : 'INVALID'} (${errorCount} errors, ${warningCount} warnings)`);
process.exit(valid ? 0 : 1);

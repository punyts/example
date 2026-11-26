/**
 * Validates the Lumen desktop document (src/desktop) as scripts/validate.ts validates Northwind Ops: one line per
 * finding, and it exits 1 on any finding, an error or a warning
 *
 *     npm run validate
 */
import { libraryFromCatalog, validateDocument } from '@punyts/stateui-app/core';
import type { BuildError } from '@punyts/stateui-app/core';
import { isIconName } from '@punyts/stateui-components';
import catalog from '@punyts/stateui-components/catalog.json' with { type: 'json' };
import { desktopDocument } from '../src/desktop/document.ts';

const format = (error: BuildError): string =>
    `${error.severity ?? 'error'} ${error.code} ${error.message}${error.statePath ? ` (${error.statePath})` : ''}`;

const { valid, errors } = validateDocument(desktopDocument(), libraryFromCatalog(catalog as never), { isIconName });
for (const error of errors) console.log(format(error));
const errorCount = errors.filter((error) => (error.severity ?? 'error') === 'error').length;
console.log(`validate desktop: ${valid ? 'valid' : 'INVALID'} (${errorCount} errors, ${errors.length - errorCount} warnings)`);
process.exit(errors.length === 0 ? 0 : 1);

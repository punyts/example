/**
 * Page entry of desktop.html: starts the Lumen desktop in #desktop
 */
import { startDesktop } from './bootstrap.ts';

const host = document.getElementById('desktop');
if (!host) throw new Error('#desktop is missing from desktop.html');
const desktop = await startDesktop(host);

// Handy in the browser console: window.lumen.store.get('$.data.fs.items')
(window as unknown as { lumen: typeof desktop }).lumen = desktop;

/**
 * Page entry: mounts Northwind Ops into #app and starts the agent console beside it
 */
import { startApp } from './bootstrap.ts';
import { startConsole } from './console.ts';

const byId = (id: string): HTMLElement => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`#${id} is missing from index.html`);
    return element;
};

const host = byId('app');
const app = startApp(host);
startConsole(app.store, { root: byId('console'), log: byId('agent-log'), json: byId('store-json'), appHost: host });

// Handy in the browser console: window.northwind.store.get('$.data.stats')
(window as unknown as { northwind: typeof app }).northwind = app;

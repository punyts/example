/**
 * Starts Northwind Ops: registers the component modules, builds the library from the catalog, mounts the app document
 * with `mountApp` and the locale step, and connects the few things that need code (`onEmit` handlers, generated data
 * and the store "bridges" that turn a store write into a component command). `main.ts` calls it for the page and the
 * browser test calls it for each test
 */
import type { Store } from '@punyts/state';
import { libraryFromCatalog, mountApp, registerLocaleStep, registerMountStep } from '@punyts/stateui-app';
import type { AppDocument, AppState, BuildError, ComponentLibrary, ComponentOverlays, JsonObject, LocaleStepHandle } from '@punyts/stateui-app';
import catalog from '@punyts/stateui-components/catalog.json';
import { registerAll } from '@punyts/stateui-components/components';
import { computeStats, generateCustomers, generateOrders, makeOrder } from './data.ts';
import type { Customer, Order, OrderStatus } from './data.ts';
import { appDocument } from './document/index.ts';
import icons from './icons.json';

/** The component overlays the library ships, `<name>.locale.<code>.json`, grouped as `registerLocaleStep` wants them */
const localeFiles = import.meta.glob<JsonObject>('@stateui-components-dist/*.locale.*.json', { eager: true, import: 'default' });
const LOCALE_FILE = /([a-zA-Z0-9]+)\.locale\.([a-zA-Z-]+)\.json$/;

export function componentOverlays(files: Readonly<Record<string, JsonObject>> = localeFiles): ComponentOverlays {
    const overlays: Record<string, Record<string, JsonObject>> = {};
    for (const [file, overlay] of Object.entries(files)) {
        const match = LOCALE_FILE.exec(file);
        if (!match) continue;
        (overlays[match[1] as string] ??= {})[match[2] as string] = overlay;
    }
    return overlays;
}

/** State paths of the nodes the code talks to */
export const PATHS = {
    toasts: '$.app.toasts',
    orders: '$.app.children.orders',
    orderList: '$.app.children.orders.children.list',
    customerList: '$.app.children.customers.children.list',
    detail: '$.app.children.orders.children.detail',
    newOrder: '$.app.children.orders.children.newOrder',
    cancelDialog: '$.app.children.orders.children.cancelDialog'
} as const;

export interface RunningApp {
    store: Store<AppState>;
    locale: LocaleStepHandle;
    /** Validation warnings from `mountApp` and every `SUI-RUN` error reported while running */
    errors: BuildError[];
    /** The element a root component rendered for the node at `path`, searching open shadow roots */
    elementAt(path: string): HTMLElement | undefined;
    /** Runs a component command on the node at `path`, as an `on` entry would */
    command(path: string, name: string, value?: unknown): void;
    dispose(): void;
}

export interface StartOptions {
    /** Number of generated orders (10,000 by default) */
    orderCount?: number;
    /** Delay of the fake refresh and forecast, in ms */
    fakeDelay?: number;
}

type CommandElement = HTMLElement & {
    scope?: { basePath?: string };
    commands?: Record<string, (value?: unknown, payload?: unknown) => void>;
};

function findAt(root: ParentNode, path: string): CommandElement | undefined {
    for (const element of Array.from(root.querySelectorAll('*')) as CommandElement[]) {
        if (element.scope?.basePath === path && element.localName.startsWith('ui-')) return element;
        if (element.shadowRoot) {
            const inner = findAt(element.shadowRoot, path);
            if (inner) return inner;
        }
    }
    return undefined;
}

const report = (errors: BuildError[]) => (error: BuildError): void => {
    errors.push(error);
    console.error(`[northwind] ${error.code} ${error.message}${error.statePath ? ` at ${error.statePath}` : ''}`);
};

let registered = false;

export function startApp(host: HTMLElement, options: StartOptions = {}): RunningApp {
    if (!registered) {
        registerAll();
        registered = true;
    }
    const library: ComponentLibrary = libraryFromCatalog(catalog as never);
    const customers: Record<string, Customer> = generateCustomers();
    const orders: Order[] = generateOrders(customers, options.orderCount);
    const fakeDelay = options.fakeDelay ?? 900;
    const errors: BuildError[] = [];
    const onError = report(errors);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number): void => {
        const timer = setTimeout(() => {
            timers.delete(timer);
            fn();
        }, ms);
        timers.add(timer);
    };

    // The customers fit in the document's data (512 KiB limit); 10,000 orders do not, so the data step writes them
    const document = { ...appDocument, data: { ...appDocument.data, customers } } as unknown as AppDocument;

    const locale = registerLocaleStep(componentOverlays());
    const unregisterData = registerMountStep('northwind-data', {
        start({ store }) {
            store.set('$.runtime.icons', icons as never);
            store.replace('$.data.orders', orders);
        }
    });

    let store: Store<AppState> | undefined;
    const elementAt = (path: string): HTMLElement | undefined => findAt(host, path);
    const command = (path: string, name: string, value?: unknown): void => {
        const handler = findAt(host, path)?.commands?.[name];
        if (typeof handler !== 'function') throw new Error(`no element at ${path} handles ${name}`);
        handler(value);
    };
    const toast = (key: string): void => {
        try {
            command(PATHS.toasts, 'show', key);
        } catch (error) {
            console.error(`[northwind] toast ${key}:`, error);
        }
    };

    const orderList = (): Order[] => (store as Store<AppState>).get<Order[]>('$.data.orders');
    const indexOf = (id: string): number => {
        const list = orderList();
        const guess = Number(id) - 1;
        if (list[guess]?.id === id) return guess;
        return list.findIndex((order) => order.id === id);
    };

    let statsQueued = false;
    const refreshStats = (): void => {
        if (statsQueued || !store) return;
        statsQueued = true;
        queueMicrotask(() => {
            statsQueued = false;
            if (!store) return;
            const stats = computeStats(orderList(), customers);
            store.apply('$.data.stats', { ...stats, forecast: Math.round(stats.revenueDelta * 1.08) });
        });
    };

    const showDetail = (id: string): void => {
        const index = indexOf(id);
        if (index < 0 || !store) return;
        const order = store.get<Order>(`$.data.orders.${index}`);
        store.replace('$.data.detail', JSON.parse(JSON.stringify(order)) as Order);
    };

    const setStatus = (id: string, status: OrderStatus, tone: Order['statusTone'], progress: number): void => {
        const index = indexOf(id);
        if (index < 0 || !store) return;
        const patch = { status, statusTone: tone, progress };
        store.apply(`$.data.orders.${index}`, patch);
        if (store.get<string>('$.data.detail.id') === id) store.apply('$.data.detail', patch);
        refreshStats();
    };

    const onEmit = (name: string, payload: unknown): void => {
        if (!store) return;
        switch (name) {
            case 'orders.jump': {
                const text = typeof payload === 'string' ? payload.trim().replace(/^#/, '') : '';
                if (text !== '') store.set('$.data.requests.jumpTo', text);
                break;
            }
            case 'orders.refresh':
                later(() => {
                    store?.set('$.data.ui.ordersLoading', false);
                    toast('refreshed');
                }, fakeDelay);
                break;
            case 'order.open':
                showDetail(String(payload));
                break;
            case 'order.ship':
                // A row menu passes the row's id; the drawer menu acts on the selected order
                setStatus(typeof payload === 'string' && payload !== '' ? payload : String(store.get('$.data.selectedOrder')), 'shipped', 'success', 85);
                break;
            case 'order.cancel':
                setStatus(String(store.get('$.data.selectedOrder')), 'cancelled', 'danger', 0);
                break;
            case 'order.create': {
                const values = ((payload as { values?: Record<string, unknown> } | undefined)?.values ?? {}) as Record<string, unknown>;
                const number = orderList().length + 1;
                const name = String(values['customer'] ?? '').trim();
                const order = makeOrder({
                    number,
                    customer: { id: 'new', name, email: String(values['email'] ?? '') },
                    productKey: String(values['product'] ?? 'chai'),
                    quantity: Math.max(1, Number(values['quantity']) || 1),
                    status: 'pending',
                    channel: String(values['channel'] ?? 'web'),
                    priority: values['express'] === true ? 'express' : 'standard',
                    created: String(values['delivery'] ?? '')
                });
                orderList().push(order);
                store.set('$.data.selectedOrder', order.id);
                store.set('$.data.requests.jumpTo', order.id);
                refreshStats();
                break;
            }
            default:
                console.warn(`[northwind] unhandled emit ${name}`);
        }
    };

    const mounted = mountApp(host, document, library, { onEmit, onError });
    if (!mounted.store) {
        locale.unregister();
        unregisterData();
        for (const error of mounted.errors) onError(error);
        throw new Error(`Northwind Ops did not mount: ${mounted.errors.map((error) => error.code).join(', ')}`);
    }
    store = mounted.store;
    errors.push(...mounted.errors);
    const live = store;

    // recordList sizes to its host; a document has no property for a height, so the code gives the two lists one
    const sizeLists = (): void => {
        const ordersEl = elementAt(PATHS.orderList);
        const customersEl = elementAt(PATHS.customerList);
        if (ordersEl) ordersEl.style.blockSize = '520px';
        if (customersEl) customersEl.style.blockSize = '460px';
    };
    sizeLists();

    // Bridges: a store write is the API for the agent console too. These turn three writes into what needs code
    const onLocale = (_path: string, value: unknown): void => {
        const code = String(value);
        if (code === applied) return;
        const failed = locale.switchTo(code);
        if (failed.length > 0) {
            failed.forEach(onError);
            live.set('$.locale', applied);
            return;
        }
        applied = code;
    };
    let applied = String(live.get('$.locale'));
    const onToast = (_path: string, value: unknown): void => {
        if (typeof value !== 'string' || value === '') return;
        toast(value);
        live.set('$.data.requests.toast', '');
    };
    const onJump = (_path: string, value: unknown): void => {
        if (typeof value !== 'string' || value === '') return;
        try {
            command(PATHS.orderList, 'scrollTo', value);
            live.set('$.data.selectedOrder', value);
        } catch (error) {
            console.error(`[northwind] jump to ${value}:`, error);
        }
        live.set('$.data.requests.jumpTo', '');
    };
    live.on('$.locale', onLocale);
    live.on('$.data.requests.toast', onToast);
    live.on('$.data.requests.jumpTo', onJump);

    refreshStats();
    later(() => live.set('$.data.ui.forecastLoading', false), fakeDelay * 2);

    let disposed = false;
    return {
        store: live,
        locale,
        errors,
        elementAt,
        command,
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const timer of timers) clearTimeout(timer);
            live.off('$.locale', onLocale);
            live.off('$.data.requests.toast', onToast);
            live.off('$.data.requests.jumpTo', onJump);
            mounted.dispose();
            locale.unregister();
            unregisterData();
            store = undefined;
        }
    };
}


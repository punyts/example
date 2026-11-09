/**
 * Starts Northwind Ops: registers the component modules, builds the library from the catalog, mounts the app document
 * with `mountApp` and the locale step, and connects the few things that need code (`onEmit` handlers, generated data
 * and the store "bridges" that turn a store write into a component command). `main.ts` calls it for the page and the
 * browser test calls it for each test
 */
import type { Store } from '@punyts/state';
import { FileTransferError, libraryFromCatalog, mountApp, registerLocaleStep, registerMountStep } from '@punyts/stateui-app';
import type { AppDocument, AppState, BuildError, ComponentLibrary, ComponentOverlays, JsonObject, LocaleStepHandle, TransferFile } from '@punyts/stateui-app';
import catalog from '@punyts/stateui-components/catalog.json';
import { registerAll } from '@punyts/stateui-components/components';
import { PRODUCTS, STATUS_PROGRESS, STATUS_TONES, computeStats, generateCustomers, generateOrders, makeOrder } from './data.ts';
import type { Customer, Order, OrderStatus } from './data.ts';
import { createArchiveApi } from './archive.ts';
import { RIDGELINE_FUNCTIONS } from './ridgeline.ts';
import type { ArchiveApi } from './archive.ts';
import { appDocument } from './document/index.ts';
import icons from './icons.json';
import { bindSections, showSection } from './sections.ts';
import { CATEGORIES, CUSTOMER_REPLY, STEPS, completedSteps, emptyProductDraft, ordersByStatus, recentOrders, revenueByMonth, seedData, topCustomers } from './seed.ts';
import type { Category, Delivery, Message, Product } from './seed.ts';
import { categoryTrail, filterDeliveries, pageOf, productsInCategory } from './views.ts';
import { load3d, readFile } from './warehouse.ts';

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
    orders: '$.screens.main.children.orders',
    archive: '$.screens.main.children.archive',
    archiveList: '$.screens.main.children.archive.children.archiveList',
    orderList: '$.screens.main.children.orders.children.list',
    customerList: '$.screens.main.children.customers.children.list',
    detail: '$.screens.main.children.orders.children.detail',
    newOrder: '$.screens.main.children.orders.children.newOrder',
    cancelDialog: '$.screens.main.children.orders.children.cancelDialog',
    board: '$.screens.main.children.fulfilment.children.board',
    calendar: '$.screens.main.children.deliveries.children.calendar',
    crud: '$.screens.main.children.products.children.tabs.children.manage',
    wizard: '$.screens.main.children.desk.children.wizard',
    chat: '$.screens.main.children.support.children.chat.children.view',
    settings: '$.screens.main.children.settings'
} as const;

/** The children of the screen root that frame the sections: the section density skips them, and the settings */
const FRAME: readonly string[] = ['header', 'nav', 'footer', 'settings'];

/**
 * Record views and tables size themselves to their host. One in a column, row or grid takes its height from its
 * placement in the document; these sit in tabs, a split pane or a composed component, where a placement has no height,
 * so bootstrap sets it
 */
const SIZES: Readonly<Record<string, string>> = {
    '$.screens.main.children.products.children.tabs.children.manage.children.table': '320px',
    '$.screens.main.children.products.children.tabs.children.stock': '360px',
    '$.screens.main.children.products.children.tabs.children.gallery': '420px',
    '$.screens.main.children.catalog.children.split.start': '420px',
    '$.screens.main.children.catalog.children.split.end.children.list': '380px'
};

export interface RunningApp {
    store: Store<AppState>;
    locale: LocaleStepHandle;
    /** Validation warnings from `mountApp` and every `SUI-RUN` error reported while running */
    errors: BuildError[];
    /** The element a root component rendered for the node at `path`, searching open shadow roots */
    elementAt(path: string): HTMLElement | undefined;
    /** Runs a component command on the node at `path`, as an `on` entry would */
    command(path: string, name: string, value?: unknown): void;
    /** Shows one section, as a nav item does: writes `$.data.view.section` */
    showSection(name: string): void;
    /** The fake archive API behind the archive section's effect: its requests, aborts and answer delay */
    archive: ArchiveApi;
    dispose(): void;
}

export interface StartOptions {
    /** Number of generated orders (10,000 by default) */
    orderCount?: number;
    /** Delay of the fake refresh and forecast, in ms */
    fakeDelay?: number;
    /** Delay of an answer of the fake archive API, in ms (400 by default) */
    archiveDelay?: number;
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
    const archive = createArchiveApi(orders, options.archiveDelay ?? 400);
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
    const document = { ...appDocument, data: { ...appDocument.data, ...seedData(orders, customers) } } as unknown as AppDocument;

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
            const list = orderList();
            store.set('$.data.charts.byMonth', revenueByMonth(list));
            store.set('$.data.charts.byStatus', ordersByStatus(list));
            store.set('$.data.recent', recentOrders(list));
            store.set('$.data.topCustomers', topCustomers(list, customers));
        });
    };

    const showDetail = (id: string): void => {
        const index = indexOf(id);
        if (index < 0 || !store) return;
        const order = store.get<Order>(`$.data.orders.${index}`);
        store.replace('$.data.detail', { ...(JSON.parse(JSON.stringify(order)) as Order), step: order.status, completed: completedSteps(order.status) });
    };

    const setStatus = (id: string, status: OrderStatus, tone: Order['statusTone'], progress: number): void => {
        const index = indexOf(id);
        if (index < 0 || !store) return;
        const patch = { status, statusTone: tone, progress };
        store.apply(`$.data.orders.${index}`, patch);
        if (store.get<string>('$.data.detail.id') === id) store.apply('$.data.detail', { ...patch, step: status, completed: completedSteps(status) });
        refreshStats();
    };

    const moveTo = (id: string, status: OrderStatus): void => setStatus(id, status, STATUS_TONES[status], STATUS_PROGRESS[status]);
    const currentLocale = (): string => String((store as Store<AppState>).get('$.locale'));
    const words = (key: 'deliveries' | 'delivery' | 'noneOn'): string => {
        const german = currentLocale() === 'de';
        const texts = {
            deliveries: german ? 'Lieferungen am' : 'Deliveries on',
            delivery: german ? 'Lieferung' : 'Delivery',
            noneOn: german ? 'Keine Lieferungen am' : 'No deliveries on'
        };
        return texts[key];
    };

    // Products: crudTable, stock table, gallery and the wizard's product select all read $.data.products.all
    const products = (): Product[] => (store as Store<AppState>).get<Product[]>('$.data.products.all');
    const categoryLabel = (id: string): string => CATEGORIES.find((category) => category.id === id)?.label ?? id;
    const formatPrice = (value: number): string => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(value);
    const publishProducts = (list: Product[]): void => {
        const live = store as Store<AppState>;
        live.set('$.data.products.all', list);
        live.set(
            '$.data.productOptions',
            list.map((product) => ({ id: product.id, name: product.name }))
        );
    };
    const saveProduct = (): void => {
        const live = store as Store<AppState>;
        const draft = live.get<Record<string, unknown>>('$.data.products.draft');
        const name = String(draft['name'] ?? '').trim();
        if (name === '') return;
        const price = Number(draft['price']) || 0;
        const stock = Math.max(0, Math.round(Number(draft['stock']) || 0));
        const category = String(draft['category'] ?? 'tea');
        const id = String(draft['id'] ?? '') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const list = products();
        const index = list.findIndex((product) => product.id === id);
        const base: Product =
            index >= 0
                ? (list[index] as Product)
                : { id, name, sku: `NW-${id.toUpperCase()}`, category, categoryLabel: '', description: '', price, priceText: '', stock, reorder: false, visible: true, lifecycle: 'active' };
        const saved: Product = { ...base, name, category, categoryLabel: categoryLabel(category), price, priceText: formatPrice(price), stock, reorder: stock < 15 };
        publishProducts(index >= 0 ? list.map((product, at) => (at === index ? saved : product)) : [...list, saved]);
        live.set('$.data.products.draft', emptyProductDraft());
    };

    // Catalog: the master list holds copies of the products of the picked category; edits are written back by id
    let syncing = false;
    const refreshCatalog = (): void => {
        const live = store as Store<AppState>;
        const category = live.get<string>('$.data.catalog.category');
        const categories = live.get<Category[]>('$.data.categories');
        const items = productsInCategory(products(), categories, category).map((product) => ({ ...product }));
        syncing = true;
        try {
            live.set('$.data.catalog.items', items);
            if (!items.some((item) => item.id === live.get<string>('$.data.catalog.selected'))) live.set('$.data.catalog.selected', '');
            live.set('$.data.catalog.trail', categoryTrail(categories, category, currentLocale() === 'de' ? 'Katalog' : 'Catalog'));
        } finally {
            syncing = false;
        }
    };
    const writeBackCatalog = (path: string): void => {
        if (syncing || !store) return;
        const index = Number(/\.items\.(\d+)\./.exec(path)?.[1] ?? -1);
        const item = (store.get<Product[]>('$.data.catalog.items') ?? [])[index];
        const target = products().findIndex((product) => product.id === item?.id);
        if (!item || target < 0) return;
        syncing = true;
        try {
            store.apply(`$.data.products.all.${target}`, { name: item.name, description: item.description });
            store.set(
                '$.data.productOptions',
                products().map((product) => ({ id: product.id, name: product.name }))
            );
        } finally {
            syncing = false;
        }
    };
    const onProductsChanged = (): void => {
        if (!syncing) refreshCatalog();
    };

    // Deliveries: the date range filters the calendar and the list, the pagination slices the list
    const refreshDeliveries = (): void => {
        const live = store as Store<AppState>;
        const all = live.get<Delivery[]>('$.data.deliveries.all');
        const range = { start: live.get<string>('$.data.deliveries.range.start'), end: live.get<string>('$.data.deliveries.range.end') };
        const shown = filterDeliveries(all, range);
        live.set('$.data.deliveries.shown', shown);
        live.set('$.data.deliveries.total', shown.length);
        live.set('$.data.deliveries.rows', pageOf(shown, Number(live.get('$.data.deliveries.page')) || 1, Number(live.get('$.data.deliveries.pageSize')) || 6));
    };
    const showDay = (day: string): void => {
        const live = store as Store<AppState>;
        const shown = live.get<Delivery[]>('$.data.deliveries.shown').filter((delivery) => delivery.start === day);
        live.set('$.data.deliveries.dayText', shown.length === 0 ? `${words('noneOn')} ${day}` : `${words('deliveries')} ${day}: ${shown.map((delivery) => delivery.title).join(', ')}`);
    };

    // The support chat: the agent's message is appended, then the customer's reply streams into one record chunk by chunk
    let chatCount = 0;
    const streamReply = (): void => {
        const live = store as Store<AppState>;
        const at = live.get<Message[]>('$.data.chat.messages').length;
        live.set(`$.data.chat.messages.${at}`, { id: `r${++chatCount}`, author: 'Ada Andersen', text: '', time: 'Now', streaming: true });
        const pieces = CUSTOMER_REPLY.split(/(?<=\s)/);
        const step = Math.ceil(pieces.length / 6);
        const interval = Math.max(10, Math.round(fakeDelay / 3));
        let shown = 0;
        const next = (): void => {
            shown = Math.min(pieces.length, shown + step);
            live.set(`$.data.chat.messages.${at}.text`, pieces.slice(0, shown).join(''));
            if (shown >= pieces.length) live.set(`$.data.chat.messages.${at}.streaming`, false);
            else later(next, interval);
        };
        later(next, interval);
    };

    // The simulated file host: nothing leaves the browser tab; the reference is a local id
    let uploads = 0;
    const transferFile: TransferFile = (file, options = {}) =>
        new Promise((resolve, reject) => {
            if (file.size > 2 * 1024 * 1024) {
                reject(new FileTransferError('too_large', 'The file is larger than 2 MB'));
                return;
            }
            const { onProgress, signal } = options;
            let loaded = 0;
            const chunk = Math.max(1, Math.ceil(file.size / 4));
            const tick = (): void => {
                if (signal?.aborted) {
                    reject(new FileTransferError('cancelled', 'The upload was cancelled'));
                    return;
                }
                loaded = Math.min(file.size, loaded + chunk);
                onProgress?.({ loaded, total: file.size });
                if (loaded < file.size) {
                    later(tick, Math.max(10, Math.round(fakeDelay / 4)));
                    return;
                }
                uploads++;
                toast('uploaded');
                resolve({ id: `local-${uploads}`, name: file.name, size: file.size, type: file.type });
            };
            later(tick, 10);
        });

    const resetWizard = (): void => {
        const live = store as Store<AppState>;
        live.set('$.data.wizard', { customer: '', contact: '', channel: 'phone', delivery: '', product: '', productName: '', quantity: 1, discount: 0, extras: [], express: false, attachment: [], attachmentName: '' });
        live.set(`${PATHS.wizard}.children.stepper.completed`, []);
        live.set(`${PATHS.wizard}.children.stepper.active`, 'details');
        try {
            command(`${PATHS.wizard}.children.tabs`, 'select', 'details');
            for (const step of ['details', 'options', 'review']) command(`${PATHS.wizard}.children.tabs.children.${step}`, 'reset');
        } catch (error) {
            console.error('[northwind] wizard reset:', error);
        }
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
            case 'nav.goto':
                showSection(store, payload === 'home' ? 'dashboard' : String(payload));
                break;
            case 'order.step': {
                const id = store.get<string>('$.data.detail.id');
                const step = String(payload) as OrderStatus;
                if (id !== '' && STEPS.includes(step) && store.get<string>('$.data.detail.status') !== 'cancelled') moveTo(id, step);
                break;
            }
            case 'board.move': {
                const move = payload as { key?: string; to?: string } | undefined;
                if (move?.key && move.to && move.to in STATUS_TONES) {
                    moveTo(move.key, move.to as OrderStatus);
                    toast('orderMoved');
                }
                break;
            }
            case 'delivery.day':
                showDay(String(payload));
                break;
            case 'delivery.open': {
                const delivery = store.get<Delivery[]>('$.data.deliveries.all').find((candidate) => candidate.id === payload);
                if (delivery) store.set('$.data.deliveries.dayText', `${words('delivery')}: ${delivery.title}, ${delivery.customer}, ${delivery.city} (${delivery.slot}, ${delivery.start})`);
                break;
            }
            case 'catalog.crumb':
                store.set('$.data.catalog.category', payload === 'catalog' ? '' : String(payload));
                break;
            case 'chat.send': {
                const text = typeof payload === 'string' ? payload.trim() : '';
                if (text === '') break;
                store.set(`$.data.chat.messages.${store.get<Message[]>('$.data.chat.messages').length}`, { id: `u${++chatCount}`, author: 'Dana (Northwind)', text, time: 'Now' });
                streamReply();
                break;
            }
            case 'support.note':
                store.set('$.data.support.note', '');
                break;
            case 'support.escalate':
                store.set('$.data.support.reason', '');
                store.set('$.data.support.details', '');
                break;
            case 'product.new':
                store.set('$.data.products.draft', emptyProductDraft());
                break;
            case 'crudTable.edit': {
                const product = products().find((candidate) => candidate.id === payload);
                if (product) store.set('$.data.products.draft', { id: product.id, name: product.name, category: product.category, price: product.price, stock: product.stock });
                break;
            }
            case 'crudTable.save':
                saveProduct();
                toast('productSaved');
                break;
            case 'crudTable.delete': {
                const id = store.get<string>(`${PATHS.crud}.children.table.selected`);
                if (id !== '') {
                    publishProducts(products().filter((product) => product.id !== id));
                    toast('productDeleted');
                }
                break;
            }
            case 'wizard.done': {
                const wizard = store.get<Record<string, unknown>>('$.data.wizard');
                const name = String(wizard['customer'] ?? '').trim();
                const known = Object.values(customers).find((customer) => customer.name === name);
                const extras = Array.isArray(wizard['extras']) ? (wizard['extras'] as string[]).join(', ') : '';
                const files = Array.isArray(wizard['attachment']) ? (wizard['attachment'] as { name?: string }[]) : [];
                const order = makeOrder({
                    number: orderList().length + 1,
                    customer: known ?? { id: 'new', name, email: String(wizard['contact'] ?? '') },
                    productKey: String(wizard['product'] ?? '') in PRODUCTS ? String(wizard['product']) : 'chai',
                    quantity: Math.max(1, Number(wizard['quantity']) || 1),
                    status: 'pending',
                    channel: String(wizard['channel'] || 'phone'),
                    priority: wizard['express'] === true ? 'express' : 'standard',
                    created: String(wizard['delivery'] ?? ''),
                    extras,
                    attachment: files[0]?.name ?? ''
                });
                const discount = Number(wizard['discount']) || 0;
                if (discount > 0) {
                    order.total = Math.round(order.total * (1 - discount) * 100) / 100;
                    order.totalText = formatPrice(order.total);
                }
                orderList().push(order);
                store.set('$.data.selectedOrder', order.id);
                refreshStats();
                resetWizard();
                toast('orderCreated');
                break;
            }
            default:
                console.warn(`[northwind] unhandled emit ${name}`);
        }
    };

    const mounted = mountApp(host, document, library, { onEmit, onError, transferFile, readFile, load3d }, { logicFunctions: { ...archive.functions, expressions: { ...archive.functions.expressions, ...RIDGELINE_FUNCTIONS } } });
    if (!mounted.store) {
        locale.unregister();
        unregisterData();
        for (const error of mounted.errors) onError(error);
        throw new Error(`Northwind Ops did not mount: ${mounted.errors.map((error) => error.code).join(', ')}`);
    }
    store = mounted.store;
    errors.push(...mounted.errors);
    const live = store;

    // The record views whose parent gives a placement no height
    for (const [path, height] of Object.entries(SIZES)) {
        const element = elementAt(path);
        if (element) element.style.blockSize = height;
    }

    // Bridges: a store write is the API for the agent console too. These turn writes into what needs code
    let applied = String(live.get('$.locale'));
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
        if (live.get('$.data.prefs.language') !== code) live.set('$.data.prefs.language', code);
        refreshCatalog();
    };
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
    /** Writes `value` to `target` unless it already holds it, so two bridges that mirror each other settle */
    const mirror = (target: string) => (_path: string, value: unknown): void => {
        if (live.get(target) !== value) live.set(target, value as string);
    };
    const ACCENTS: Readonly<Record<string, string>> = {
        blue: '{palette.blue.600}',
        teal: '{palette.teal.700}',
        violet: '{palette.violet.600}',
        amber: '#b45309'
    };
    const onAccent = (_path: string, value: unknown): void => {
        const token = ACCENTS[String(value)];
        if (token) live.set('$.theme.tokens.color.accent.base', token);
    };
    const onDensity = (_path: string, value: unknown): void => {
        for (const name of Object.keys(live.get<Record<string, unknown>>('$.screens.main.children'))) {
            if (!FRAME.includes(name)) live.set(`$.screens.main.children.${name}.density`, value as string);
        }
    };
    const onRange = (): void => {
        if (live.get<number>('$.data.deliveries.page') !== 1) live.set('$.data.deliveries.page', 1);
        refreshDeliveries();
    };
    const onWizardProduct = (_path: string, value: unknown): void => {
        const name = products().find((product) => product.id === value)?.name ?? '';
        if (live.get('$.data.wizard.productName') !== name) live.set('$.data.wizard.productName', name);
    };
    const onWizardFile = (_path: string, value: unknown): void => {
        const first = Array.isArray(value) ? (value[0] as { name?: string } | undefined) : undefined;
        const name = first?.name ?? '';
        if (live.get('$.data.wizard.attachmentName') !== name) live.set('$.data.wizard.attachmentName', name);
    };
    const bridges: [string | string[], (path: string, value: unknown) => void][] = [
        ['$.locale', onLocale],
        ['$.data.prefs.language', mirror('$.locale')],
        ['$.theme.active.mode', mirror('$.data.prefs.mode')],
        ['$.data.prefs.mode', mirror('$.theme.active.mode')],
        ['$.theme.active.motion', mirror('$.data.prefs.motion')],
        ['$.data.prefs.motion', mirror('$.theme.active.motion')],
        ['$.data.prefs.density', onDensity],
        ['$.data.prefs.accent', onAccent],
        ['$.data.requests.toast', onToast],
        ['$.data.requests.jumpTo', onJump],
        [['$.data.deliveries.range.start', '$.data.deliveries.range.end'], onRange],
        [['$.data.deliveries.page', '$.data.deliveries.pageSize'], refreshDeliveries],
        ['$.data.catalog.category', refreshCatalog],
        [['$.data.products.all', '$.data.products.all.$all'], onProductsChanged],
        ['$.data.catalog.items.$all', writeBackCatalog],
        ['$.data.wizard.product', onWizardProduct],
        ['$.data.wizard.attachment', onWizardFile]
    ];
    for (const [paths, listener] of bridges) live.on(paths, listener);
    const unbindSections = bindSections(live);

    refreshStats();
    later(() => live.set('$.data.ui.forecastLoading', false), fakeDelay * 2);

    let disposed = false;
    return {
        store: live,
        locale,
        errors,
        elementAt,
        command,
        showSection: (name: string) => showSection(live, name),
        archive,
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const timer of timers) clearTimeout(timer);
            for (const [paths, listener] of bridges) live.off(paths, listener);
            unbindSections();
            mounted.dispose();
            locale.unregister();
            unregisterData();
            store = undefined;
        }
    };
}

/**
 * Northwind Ops in a real browser (Vitest browser mode, Chromium through Playwright). Each test mounts the whole app
 * into a fresh host, drives it through the rendered controls where it can, and reads the result from the store and
 * the DOM
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS, startApp } from '../src/bootstrap.ts';
import type { RunningApp } from '../src/bootstrap.ts';
import catalog from '@punyts/stateui-components/catalog.json';
import type { Order } from '../src/data.ts';
import { appDocument } from '../src/document/index.ts';
import type { Delivery, Message, Product } from '../src/seed.ts';

const NAV = '$.screens.main.children.nav.children';
const SETTINGS = '$.screens.main.children.settings.children.sections.children';

/** The sections of the nav, in order; every one has a smoke test */
const SECTIONS = ['dashboard', 'orders', 'archive', 'fulfilment', 'deliveries', 'customers', 'products', 'catalog', 'warehouse', 'ridgeline', 'desk', 'support', 'help', 'settings'] as const;

/** Components that exist only as test fixtures of the component library */
const FIXTURES = new Set(['orderEditor', 'probe']);
const SETTINGS_PANEL = '$.screens.main.children.settings';
const MODE = `${SETTINGS_PANEL}.children.sections.children.appearance.children.mode.children.mode`;
const NEW_ORDER_FIELDS = `${PATHS.newOrder}.body.children`;

let host: HTMLElement;
let app: RunningApp;

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `check` returns true, so a test waits for renders and timers without fixed sleeps */
async function until(check: () => boolean, timeout = 3000): Promise<void> {
    const end = performance.now() + timeout;
    while (!check()) {
        if (performance.now() > end) throw new Error('condition not met in time');
        await wait(16);
    }
}

/** Every element below `root` (and in its own shadow root), through open shadow roots */
function deepAll(root: ParentNode): Element[] {
    const out: Element[] = root instanceof Element && root.shadowRoot ? deepAll(root.shadowRoot) : [];
    for (const element of Array.from(root.querySelectorAll('*'))) {
        out.push(element);
        if (element.shadowRoot) out.push(...deepAll(element.shadowRoot));
    }
    return out;
}

/** The text of an element, including the text in its (nested) shadow roots */
function deepText(root: Element | ShadowRoot): string {
    let text = `${root.textContent ?? ''} ${root instanceof Element ? (root.shadowRoot?.textContent ?? '') : ''}`;
    for (const element of deepAll(root)) if (element.shadowRoot) text += ` ${element.shadowRoot.textContent ?? ''}`;
    return text.replace(/\s+/g, ' ');
}

function elementAt(path: string): HTMLElement {
    const element = app.elementAt(path);
    if (!element) throw new Error(`nothing rendered at ${path}`);
    return element;
}

/** Clicks the native control a button or menu item renders, as a user would */
function press(path: string): void {
    const element = elementAt(path);
    const control = element.shadowRoot?.querySelector<HTMLElement>('button, [role="menuitem"], [role="button"]') ?? element;
    control.click();
}

/** Types into the native input of a field component and fires the events a user's typing fires */
function typeInto(path: string, value: string): void {
    const input = elementAt(path).shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
    if (!input) throw new Error(`no input at ${path}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/** Presses the option of a `segmented` (or the button of any component) whose text is `label` */
function choose(path: string, label: string): void {
    const root = elementAt(path).shadowRoot;
    const control = Array.from(root?.querySelectorAll<HTMLElement>('button, [role="radio"]') ?? []).find((candidate) => candidate.textContent?.trim() === label);
    if (!control) throw new Error(`no "${label}" at ${path}`);
    control.click();
}

/** The row cards the orders list has rendered (its recycled slots) */
function renderedRows(): HTMLElement[] {
    const prefix = `${PATHS.orderList}.slots.`;
    return deepAll(elementAt(PATHS.orderList)).filter(
        (element): element is HTMLElement =>
            element.localName === 'ui-card' && /^\d+$/.test((element as { scope?: { basePath?: string } }).scope?.basePath?.slice(prefix.length) ?? '')
    );
}

/** The state path of the rendered row (recycled slot) that currently shows the order with `id` */
function rowSlot(id: string): string | undefined {
    for (const row of renderedRows()) {
        const slot = (row as { scope?: { basePath?: string } }).scope?.basePath as string;
        const number = app.elementAt(`${slot}.children.number`);
        if (number && deepText(number).trim() === `#${id}`) return slot;
    }
    return undefined;
}

/** Every error reported while running, which a failed `on` command reports as `SUI-RUN-*` */
const runErrors = (): string[] => app.errors.filter((error) => error.code.startsWith('SUI-RUN')).map((error) => `${error.code} ${error.message}`);

function isShown(element: Element): boolean {
    return element.checkVisibility() && element.getBoundingClientRect().height > 0;
}

async function showSection(name: (typeof SECTIONS)[number]): Promise<void> {
    press(`${NAV}.${name}`);
    await until(() => app.store.get(`$.data.view.hidden.${name}`) === false);
    await frame();
}

beforeEach(() => {
    host = document.createElement('div');
    host.style.inlineSize = '1200px';
    document.body.append(host);
    app = startApp(host, { fakeDelay: 20, archiveDelay: 20 });
});

afterEach(() => {
    app.dispose();
    host.remove();
});

describe('Northwind Ops', () => {
    it('should mount without errors', async () => {
        // Arrange: the app is mounted in beforeEach

        // Act
        await frame();

        // Assert
        expect(app.errors).toEqual([]);
        expect(app.store.get<Order[]>('$.data.orders')).toHaveLength(10000);
        expect(elementAt(PATHS.orderList)).toBeDefined();
    });

    it('should switch the visible section when a nav item is pressed', async () => {
        // Arrange
        const dashboard = elementAt('$.screens.main.children.dashboard');
        const orders = elementAt(PATHS.orders);
        expect(isShown(dashboard)).toBe(true);
        expect(isShown(orders)).toBe(false);

        // Act
        await showSection('orders');

        // Assert
        expect(app.store.get('$.data.view.section')).toBe('orders');
        expect(isShown(orders)).toBe(true);
        expect(isShown(dashboard)).toBe(false);
    });

    it('should move the nav and the panels together from the one section value', async () => {
        // Arrange
        const catalog = elementAt('$.screens.main.children.catalog');
        const dashboard = elementAt('$.screens.main.children.dashboard');

        // Act
        app.store.set('$.data.view.section', 'catalog');
        await until(() => isShown(catalog));
        const refused = app.store.set('$.data.view.hidden.dashboard', false);
        app.store.set('$.data.view.section', 'nowhere');
        await frame();

        // Assert
        expect(app.store.get(`${NAV}.catalog.selected`)).toBe(true);
        expect(app.store.get(`${NAV}.dashboard.selected`)).toBe(false);
        expect(refused).toBe(false);
        expect(isShown(dashboard)).toBe(false);
        expect(app.store.get('$.data.view.section')).toBe('catalog');
        expect(SECTIONS.filter((name) => app.store.get(`$.data.view.hidden.${name}`) === false)).toEqual(['catalog']);
    });

    it('should render only a window of rows and bring order 9000 into view with scrollTo', async () => {
        // Arrange
        await showSection('orders');
        await until(() => renderedRows().length > 0);
        const list = elementAt(PATHS.orderList);
        const windowSize = renderedRows().length;

        // Act
        app.command(PATHS.orderList, 'scrollTo', '9000');
        await until(() => renderedRows().some((row) => deepText(row).includes('#9000')));

        // Assert
        expect(windowSize).toBeGreaterThan(0);
        expect(windowSize).toBeLessThan(100);
        expect(renderedRows().length).toBeLessThan(100);
        const row = renderedRows().find((candidate) => deepText(candidate).includes('#9000')) as HTMLElement;
        const listBox = list.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        expect(rowBox.top).toBeGreaterThanOrEqual(listBox.top - 1);
        expect(rowBox.bottom).toBeLessThanOrEqual(listBox.bottom + 1);
    });

    it('should add an order and show a toast when the new order form is submitted', async () => {
        // Arrange
        await showSection('orders');
        const before = app.store.get<Order[]>('$.data.orders').length;
        press(`${PATHS.orders}.children.tools.children.actions.children.create`);
        await until(() => app.store.get(`${PATHS.newOrder}.open`) === true);
        typeInto(`${NEW_ORDER_FIELDS}.customer`, 'Ada Lovelace');
        typeInto(`${NEW_ORDER_FIELDS}.email`, 'ada@example.com');
        typeInto(`${NEW_ORDER_FIELDS}.product`, 'coffee');
        typeInto(`${NEW_ORDER_FIELDS}.quantity`, '3');
        app.store.set('$.data.draft.channel', 'web');
        app.store.set('$.data.draft.delivery', '2026-11-15');
        app.store.set('$.data.draft.confirmed', true);
        await frame();

        // Act
        press(`${PATHS.newOrder}.footer.children.save`);
        await until(() => app.store.get<Order[]>('$.data.orders').length === before + 1);
        await until(() => deepAll(document).some((element) => element.localName === 'ui-toast' && deepText(element).includes('Order created')));

        // Assert
        const created = app.store.get<Order[]>('$.data.orders')[before] as Order;
        expect(created.customer).toBe('Ada Lovelace');
        expect(created.quantity).toBe(3);
        expect(created.status).toBe('pending');
        expect(app.store.get(`${PATHS.newOrder}.open`)).toBe(false);
        expect(app.store.get('$.data.selectedOrder')).toBe(created.id);
        expect(app.errors).toEqual([]);
    });

    it('should open the order of the row whose nested Open button is pressed', async () => {
        // Arrange
        await showSection('orders');
        await until(() => rowSlot('4') !== undefined);
        const slot = rowSlot('4') as string;

        // Act
        press(`${slot}.children.open`);
        await until(() => app.store.get(`${PATHS.detail}.open`) === true);

        // Assert
        expect(app.store.get('$.data.selectedOrder')).toBe('4');
        expect(app.store.get('$.data.detail.id')).toBe('4');
        expect(app.store.get('$.data.detail.customer')).toBe(app.store.get('$.data.orders.3.customer'));
        expect(runErrors()).toEqual([]);
    });

    it('should mark only the row order shipped when Mark shipped is selected in its row menu', async () => {
        // Arrange
        await showSection('orders');
        await until(() => renderedRows().length > 3);
        const orders = app.store.get<Order[]>('$.data.orders');
        const visible = orders.slice(0, 8).filter((order) => order.status !== 'shipped' && rowSlot(order.id) !== undefined);
        const target = visible[1] as Order;
        const neighbour = visible[0] as Order;
        const targetIndex = Number(target.id) - 1;
        const neighbourBefore = neighbour.status;
        const slot = rowSlot(target.id) as string;
        press(`${slot}.children.more.trigger`);
        await frame();

        // Act
        press(`${slot}.children.more.children.ship`);
        await until(() => app.store.get(`$.data.orders.${targetIndex}.status`) === 'shipped');

        // Assert
        expect(app.store.get(`$.data.orders.${targetIndex}.statusTone`)).toBe('success');
        expect(app.store.get('$.data.selectedOrder')).toBe(target.id);
        expect(app.store.get(`$.data.orders.${Number(neighbour.id) - 1}.status`)).toBe(neighbourBefore);
        await until(() => deepAll(document).some((element) => element.localName === 'ui-toast' && deepText(element).includes('Order shipped')));
        expect(runErrors()).toEqual([]);
    });

    it('should cancel the row order through the confirm dialog when Cancel order is selected in its row menu', async () => {
        // Arrange
        await showSection('orders');
        await until(() => rowSlot('6') !== undefined);
        const slot = rowSlot('6') as string;
        expect(app.store.get('$.data.orders.5.status')).not.toBe('cancelled');
        const otherBefore = app.store.get<string>('$.data.orders.4.status');
        press(`${slot}.children.more.trigger`);
        await frame();
        press(`${slot}.children.more.children.cancel`);
        await until(() => app.store.get(`${PATHS.cancelDialog}.open`) === true);

        // Act
        press(`${PATHS.cancelDialog}.footer.children.confirm`);
        await until(() => app.store.get('$.data.orders.5.status') === 'cancelled');

        // Assert
        expect(app.store.get('$.data.orders.5.statusTone')).toBe('danger');
        expect(app.store.get('$.data.selectedOrder')).toBe('6');
        expect(app.store.get('$.data.detail.status')).toBe('cancelled');
        expect(app.store.get('$.data.orders.4.status')).toBe(otherBefore);
        expect(app.store.get(`${PATHS.cancelDialog}.open`)).toBe(false);
        expect(runErrors()).toEqual([]);
    });

    it('should cancel the selected order when the drawer confirm dialog is confirmed', async () => {
        // Arrange
        await showSection('orders');
        await until(() => rowSlot('1') !== undefined);
        press(`${rowSlot('1') as string}.children.open`);
        await until(() => app.store.get(`${PATHS.detail}.open`) === true);
        press(`${PATHS.detail}.footer.children.cancel`);
        await until(() => app.store.get(`${PATHS.cancelDialog}.open`) === true);

        // Act
        press(`${PATHS.cancelDialog}.footer.children.confirm`);
        await until(() => app.store.get('$.data.orders.0.status') === 'cancelled');

        // Assert
        expect(app.store.get('$.data.orders.0.statusTone')).toBe('danger');
        expect(app.store.get('$.data.detail.status')).toBe('cancelled');
        expect(app.store.get(`${PATHS.cancelDialog}.open`)).toBe(false);
        expect(app.store.get(`${PATHS.detail}.open`)).toBe(false);
        expect(app.errors).toEqual([]);
    });

    it('should show German text after switching the locale to de', async () => {
        // Arrange
        await showSection('settings');
        const nav = elementAt('$.screens.main.children.nav');
        expect(deepText(nav)).toContain('Orders');

        // Act
        choose(`${SETTINGS}.general.children.language.children.language`, 'Deutsch');
        await until(() => deepText(nav).includes('Bestellungen'));

        // Assert
        expect(app.store.get('$.locale')).toBe('de');
        expect(deepText(nav)).not.toContain('Orders');
        expect(deepText(elementAt('$.screens.main.children.settings'))).toContain('Sprache');
        expect(app.errors).toEqual([]);
    });

    it('should change $.theme.active.mode when a theme mode is chosen', async () => {
        // Arrange
        await showSection('settings');
        expect(app.store.get('$.theme.active.mode')).toBe('light');

        // Act
        press(`${SETTINGS_PANEL}.children.menu.children.appearance`);
        await until(() => app.store.get(`${SETTINGS_PANEL}.children.sections.children.appearance.hidden`) === false);
        await frame();
        choose(MODE, 'Dark');
        await until(() => app.store.get('$.theme.active.mode') === 'dark');
        choose(MODE, 'High contrast');

        // Assert
        await until(() => app.store.get('$.theme.active.mode') === 'contrast');
        expect(app.store.get('$.data.prefs.mode')).toBe('contrast');
        expect(app.errors).toEqual([]);
    });
});

/** Every `component` name the app document places, in the tree and in the nodes held by map items such as table cells */
function placedComponents(value: unknown, names = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
        for (const item of value) placedComponents(item, names);
    } else if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record['component'] === 'string') names.add(record['component']);
        for (const item of Object.values(record)) placedComponents(item, names);
    }
    return names;
}

describe('Northwind Ops component coverage', () => {
    it('should place every component of the catalog in the app document', () => {
        // Arrange
        const names = (catalog as { components: { name: string }[] }).components.map((component) => component.name).filter((name) => !FIXTURES.has(name));

        // Act
        const placed = placedComponents([appDocument.app, appDocument.screens] as never);
        const missing = names.filter((name) => !placed.has(name));

        // Assert
        expect(names.length).toBeGreaterThanOrEqual(75);
        expect(missing).toEqual([]);
    });

    it('should list every section of the nav in the view flags and the German overlay', () => {
        // Arrange and Act
        type Main = { root: { children: { nav: { children: Record<string, unknown> } } }; locales: { de: { children: Record<string, { children?: Record<string, unknown> }> } } };
        const main = (appDocument.screens as unknown as { main: Main }).main;
        const nav = Object.keys(main.root.children.nav.children);
        const hidden = Object.keys((appDocument.data as unknown as { view: { hidden: Record<string, boolean> } }).view.hidden);
        const german = { nav: main.locales.de.children['nav'] as { children: Record<string, unknown> }, children: main.locales.de.children };

        // Assert
        expect(nav).toEqual([...SECTIONS]);
        expect(hidden).toEqual([...SECTIONS]);
        expect(Object.keys(german.nav.children)).toEqual([...SECTIONS]);
        for (const section of SECTIONS) expect(german.children[section], section).toBeDefined();
    });
});

describe('Northwind Ops sections', () => {
    it.each(SECTIONS)('should render the %s section without errors in English and German', async (section) => {
        // Arrange
        await showSection(section);

        // Act
        await frame();
        const shownInEnglish = isShown(elementAt(`$.screens.main.children.${section}`));
        app.store.set('$.locale', 'de');
        await until(() => deepText(elementAt('$.screens.main.children.nav')).includes('Bestellungen'));
        await frame();
        await wait(50);

        // Assert
        expect(shownInEnglish).toBe(true);
        expect(isShown(elementAt(`$.screens.main.children.${section}`))).toBe(true);
        expect(app.errors).toEqual([]);
        expect(runErrors()).toEqual([]);
    });

    it('should show every section without errors after switching to German first', async () => {
        // Arrange
        app.store.set('$.locale', 'de');
        await until(() => deepText(elementAt('$.screens.main.children.nav')).includes('Bestellungen'));

        // Act
        for (const section of SECTIONS) await showSection(section);
        await wait(100);

        // Assert
        expect(app.errors).toEqual([]);
        expect(deepText(elementAt('$.screens.main.children.settings'))).toContain('Allgemein');
    });

    it('should switch the locale back to English with no errors', async () => {
        // Arrange
        app.store.set('$.locale', 'de');
        await until(() => deepText(elementAt('$.screens.main.children.nav')).includes('Bestellungen'));

        // Act
        app.store.set('$.locale', 'en');
        await until(() => deepText(elementAt('$.screens.main.children.nav')).includes('Orders'));

        // Assert
        expect(app.store.get('$.data.prefs.language')).toBe('en');
        expect(app.errors).toEqual([]);
    });
});

describe('Northwind Ops new sections', () => {
    it('should chart revenue by month and orders by status on the dashboard', async () => {
        // Arrange and Act
        await frame();

        // Assert
        const months = app.store.get<{ label: string; revenue: number }[]>('$.data.charts.byMonth');
        const statuses = app.store.get<{ id: string; count: number }[]>('$.data.charts.byStatus');
        expect(months.length).toBeGreaterThanOrEqual(10);
        expect(months[0]?.label).toBe('Jan');
        expect(statuses.reduce((sum, status) => sum + status.count, 0)).toBe(10000);
        expect(app.store.get<unknown[]>('$.data.topCustomers')).toHaveLength(5);
        expect(app.store.get<unknown[]>('$.data.recent')).toHaveLength(6);
    });

    it('should write the new status into the order when a board card moves', async () => {
        // Arrange
        await showSection('fulfilment');
        const before = app.store.get<Order>('$.data.orders.3');
        expect(before.status).not.toBe('shipped');

        // Act
        elementAt(PATHS.board).dispatchEvent(new CustomEvent('move', { detail: { key: '4', from: before.status, to: 'shipped', index: 0 }, bubbles: true, composed: true }));
        await until(() => app.store.get('$.data.orders.3.statusTone') === 'success');

        // Assert
        expect(app.store.get('$.data.orders.3.progress')).toBe(85);
        await until(() => deepAll(document).some((element) => element.localName === 'ui-toast' && deepText(element).includes('Order moved')));
        expect(runErrors()).toEqual([]);
    });

    it('should set the order status when a step of the drawer stepper is chosen', async () => {
        // Arrange
        await showSection('orders');
        await until(() => rowSlot('2') !== undefined);
        press(`${rowSlot('2') as string}.children.open`);
        await until(() => app.store.get(`${PATHS.detail}.open`) === true);
        const stepper = `${PATHS.detail}.body.children.history.children.steps`;

        // Act
        elementAt(stepper).dispatchEvent(new CustomEvent('select', { detail: 'packed', bubbles: true, composed: true }));
        await until(() => app.store.get('$.data.orders.1.status') === 'packed');

        // Assert
        expect(app.store.get('$.data.detail.step')).toBe('packed');
        expect(app.store.get('$.data.detail.completed')).toEqual(['pending', 'paid']);
        expect(runErrors()).toEqual([]);
    });

    it('should filter and page the deliveries when the date range or the page changes', async () => {
        // Arrange
        await showSection('deliveries');
        const all = app.store.get<Delivery[]>('$.data.deliveries.all');
        const total = app.store.get<number>('$.data.deliveries.total');
        expect(total).toBe(all.length);
        expect(app.store.get<Delivery[]>('$.data.deliveries.rows')).toHaveLength(6);

        // Act
        app.store.set('$.data.deliveries.page', 2);
        await until(() => app.store.get<Delivery[]>('$.data.deliveries.rows')[0]?.id === all[6]?.id);
        app.store.set('$.data.deliveries.range', { start: '2026-11-02', end: '2026-11-08' });
        await until(() => app.store.get<number>('$.data.deliveries.total') < total);

        // Assert
        const shown = app.store.get<Delivery[]>('$.data.deliveries.shown');
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every((delivery) => delivery.start >= '2026-11-02' && delivery.start <= '2026-11-08')).toBe(true);
        expect(app.store.get('$.data.deliveries.page')).toBe(1);
        expect(app.store.get<number>('$.data.deliveries.total')).toBe(shown.length);
        expect(runErrors()).toEqual([]);
    });

    it('should list the products of a category in the catalog and write an edit back to the products', async () => {
        // Arrange
        await showSection('catalog');

        // Act
        app.store.set('$.data.catalog.category', 'beverages');
        await until(() => app.store.get<Product[]>('$.data.catalog.items').length === 3);
        app.store.set('$.data.catalog.items.0.name', 'Chai tea, large');
        await until(() => app.store.get('$.data.products.all.0.name') === 'Chai tea, large');

        // Assert
        expect(Object.keys(app.store.get<Record<string, unknown>>('$.data.catalog.trail'))).toEqual(['catalog', 'beverages']);
        expect(app.store.get<{ id: string; name: string }[]>('$.data.productOptions')[0]?.name).toBe('Chai tea, large');
        expect(runErrors()).toEqual([]);
    });

    it('should stream the customer reply into one chat message after the agent sends one', async () => {
        // Arrange
        await showSection('support');
        const input = `${PATHS.chat}.children.composer.children.input`;
        const before = app.store.get<Message[]>('$.data.chat.messages').length;
        typeInto(input, 'Please send the photo');
        await frame();

        // Act
        app.command(input, 'send');
        await until(() => app.store.get<Message[]>('$.data.chat.messages').length === before + 2);
        await until(() => app.store.get(`$.data.chat.messages.${before + 1}.streaming`) === false);

        // Assert
        const messages = app.store.get<Message[]>('$.data.chat.messages');
        expect(messages[before]?.text).toBe('Please send the photo');
        expect(messages[before + 1]?.author).toBe('Ada Andersen');
        expect(messages[before + 1]?.text).toContain('support@northwind.example');
        expect(runErrors()).toEqual([]);
    });

    it('should add a product through the crud table form', async () => {
        // Arrange
        await showSection('products');
        const crud = PATHS.crud;
        const before = app.store.get<Product[]>('$.data.products.all').length;
        press(`${crud}.actions.children.add`);
        await until(() => app.store.get(`${crud}.children.form.open`) === true);
        const fields = `${crud}.children.form.body.children`;
        typeInto(`${fields}.name`, 'Green tea');
        app.store.set('$.data.products.draft.price', 12);
        app.store.set('$.data.products.draft.stock', 30);
        await frame();

        // Act
        press(`${crud}.children.form.footer.children.save`);
        await until(() => app.store.get<Product[]>('$.data.products.all').length === before + 1);

        // Assert
        const added = app.store.get<Product[]>('$.data.products.all')[before] as Product;
        expect(added.name).toBe('Green tea');
        expect(added.price).toBe(12);
        expect(added.categoryLabel).toBe('Tea');
        expect(app.store.get<{ id: string }[]>('$.data.productOptions').some((option) => option.id === added.id)).toBe(true);
        expect(runErrors()).toEqual([]);
    });

    it('should hand an attached file to the transferFile hook and show its name in the wizard review', async () => {
        // Arrange
        await showSection('desk');
        const field = `${PATHS.wizard}.children.tabs.children.options.children.attachment`;
        const input = elementAt(field).shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]');
        if (!input) throw new Error('no file input in the attachment field');
        const transfer = new DataTransfer();
        transfer.items.add(new File(['order 4711'], 'po-4711.pdf', { type: 'application/pdf' }));

        // Act
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        await until(() => app.store.get<unknown[]>('$.data.wizard.attachment').length === 1);

        // Assert
        expect(app.store.get('$.data.wizard.attachment.0.name')).toBe('po-4711.pdf');
        await until(() => app.store.get('$.data.wizard.attachmentName') === 'po-4711.pdf');
        expect(runErrors()).toEqual([]);
    });

    it('should create an order when the wizard is finished', async () => {
        // Arrange
        await showSection('desk');
        const before = app.store.get<Order[]>('$.data.orders').length;
        const tabs = `${PATHS.wizard}.children.tabs.children`;
        app.store.set('$.data.wizard.customer', 'Wizard Customer');
        app.store.set('$.data.wizard.channel', 'phone');
        app.store.set('$.data.wizard.delivery', '2026-11-20');
        await frame();
        press(`${tabs}.details.actions.children.next`);
        await until(() => app.store.get(`${PATHS.wizard}.children.stepper.active`) === 'options');
        app.store.set('$.data.wizard.product', 'coffee');
        app.store.set('$.data.wizard.quantity', 2);
        app.store.set('$.data.wizard.discount', 0.1);
        await frame();
        press(`${tabs}.options.actions.children.next`);
        await until(() => app.store.get(`${PATHS.wizard}.children.stepper.active`) === 'review');
        await frame();
        elementAt(`${tabs}.review.children.confirm`).shadowRoot?.querySelector<HTMLInputElement>('input')?.click();
        await frame();

        // Act
        press(`${tabs}.review.actions.children.next`);
        await until(() => app.store.get<Order[]>('$.data.orders').length === before + 1);

        // Assert
        const created = app.store.get<Order[]>('$.data.orders')[before] as Order;
        expect(created.customer).toBe('Wizard Customer');
        expect(created.product).toBe('Ipoh coffee');
        expect(created.quantity).toBe(2);
        expect(created.total).toBe(82.8);
        expect(app.store.get('$.data.wizard.customer')).toBe('');
        expect(app.store.get(`${PATHS.wizard}.children.stepper.active`)).toBe('details');
        expect(runErrors()).toEqual([]);
    });

    it('should mirror the settings controls in the theme, the locale and the section density', async () => {
        // Arrange
        await showSection('settings');

        // Act
        app.store.set('$.data.prefs.density', 'compact');
        app.store.set('$.theme.active.motion', 'reduced');
        app.store.set('$.data.prefs.accent', 'teal');

        // Assert
        await until(() => app.store.get('$.screens.main.children.orders.density') === 'compact');
        expect(app.store.get('$.screens.main.children.help.density')).toBe('compact');
        expect(app.store.get('$.data.prefs.motion')).toBe('reduced');
        expect(app.store.get('$.theme.tokens.color.accent.base')).toBe('{palette.teal.700}');
        expect(app.errors).toEqual([]);
    });

    it('should open the contact modal from the help section', async () => {
        // Arrange
        await showSection('help');
        const dialog = '$.screens.main.children.help.children.contactDialog';

        // Act
        press('$.screens.main.children.help.children.more.children.contact');
        await until(() => app.store.get(`${dialog}.open`) === true);
        press(`${dialog}.footer.children.cancel`);
        await until(() => app.store.get(`${dialog}.open`) === false);

        // Assert
        expect(runErrors()).toEqual([]);
    });

    it('should go back to the dashboard when the Dashboard crumb is chosen', async () => {
        // Arrange
        await showSection('orders');

        // Act
        elementAt(`${PATHS.orders}.children.trail`).dispatchEvent(new CustomEvent('select', { detail: 'home', bubbles: true, composed: true }));
        await until(() => app.store.get('$.data.view.hidden.dashboard') === false);

        // Assert
        expect(app.store.get('$.data.view.section')).toBe('dashboard');
        expect(app.store.get('$.data.view.hidden.orders')).toBe(true);
    });

    it('should draw one bin per record and the dock picture the readFile hook serves on the floor plan', async () => {
        // Arrange and Act
        await showSection('warehouse');
        const floor = elementAt('$.screens.main.children.warehouse.children.plan.children.floor');
        await until(() => deepAll(floor).some((element) => element.localName === 'image' && (element.getAttribute('href') ?? '') !== ''), 5000);

        // Assert
        const bins = app.store.get<unknown[]>('$.data.warehouse.bins');
        expect(bins).toHaveLength(21);
        expect(deepAll(floor).filter((element) => element.localName === 'rect' && element.getAttribute('width') === '26')).toHaveLength(21);
        expect(app.errors).toEqual([]);
    });

    it('should load the 3D renderer through the load3d hook and draw the racks', async () => {
        // Arrange and Act
        await showSection('warehouse');
        const scene = elementAt('$.screens.main.children.warehouse.children.views.children.racks.children.scene');
        await until(() => scene.getAttribute('data-render') === 'ready', 15000);

        // Assert
        expect(scene.hasAttribute('data-fallback')).toBe(false);
        expect(app.errors).toEqual([]);
    });
});

describe('Northwind Ops order archive', () => {
    const ARCHIVE = '$.data.archive';
    type Row = { id: string; label: string; total: number; totalText?: string };
    const page = (): Record<string, Row> => app.store.get<Record<string, Row>>(`${ARCHIVE}.page.records`);
    const ready = (token?: string) => (): boolean => app.store.get(`${ARCHIVE}.status.state`) === 'ready' && (token === undefined || app.store.get(`${ARCHIVE}.status.token`) !== token);

    it('should load the first page, show its rows with their totals and a ready status', async () => {
        // Act
        await showSection('archive');
        await until(ready());
        await until(() => deepText(elementAt(PATHS.archiveList)).includes(Object.values(page())[0]?.label ?? '?'));

        // Assert
        const rows = page();
        expect(Object.keys(rows)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
        expect(app.store.get(`${ARCHIVE}.page.total`)).toBe(95);
        expect(rows['0']?.totalText).toMatch(/^€/);
        expect(app.store.get(`${ARCHIVE}.view.statusText`)).toBe('Up to date');
        expect(Object.keys(app.store.get<Record<string, unknown>>(`${ARCHIVE}.records`))).toHaveLength(10);
        expect(app.errors).toEqual([]);
    });

    it('should page through the pager and answer a page it has seen from the cache, with no request', async () => {
        // Arrange
        await showSection('archive');
        await until(ready());
        const firstToken = app.store.get<string>(`${ARCHIVE}.status.token`);

        // Act: the pager's next page, then back to the first page
        const pager = elementAt('$.screens.main.children.archive.children.pager');
        const next = Array.from(pager.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) => button.textContent?.includes('2'));
        if (!next) throw new Error('no page 2 button');
        next.click();
        await until(() => app.store.get(`${ARCHIVE}.request.page`) === 2);
        await until(ready(firstToken));
        const second = Object.keys(page());
        const requests = app.archive.requests.length;
        app.store.set(`${ARCHIVE}.request.page`, 1);
        await until(() => app.store.get(`${ARCHIVE}.status.token`) === firstToken);

        // Assert
        expect(second).toEqual(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19']);
        expect(app.archive.requests.length).toBe(requests);
        expect(Object.keys(page())).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
        expect(Object.keys(app.store.get<Record<string, unknown>>(`${ARCHIVE}.records`))).toHaveLength(20);
    });

    it('should cancel the request a newer one replaces and show only the newer answer', async () => {
        // Arrange
        await showSection('archive');
        await until(ready());
        app.archive.delay = 200;

        // Act
        app.store.set(`${ARCHIVE}.request.page`, 3);
        await wait(20);
        app.store.set(`${ARCHIVE}.request.page`, 4);
        const loading = app.store.get(`${ARCHIVE}.view.statusText`);
        await until(() => app.store.get(`${ARCHIVE}.status.state`) === 'ready' && Object.hasOwn(page(), '30'));

        // Assert
        expect(loading).toBe('Loading');
        expect(app.archive.aborted).toBe(1);
        expect(Object.keys(page())).toEqual(['30', '31', '32', '33', '34', '35', '36', '37', '38', '39']);
        expect(Object.keys(app.store.get<Record<string, unknown>>(`${ARCHIVE}.records`))).toHaveLength(20);
    });

    it('should rewrite the row of a record that changes, its total formatted again', async () => {
        // Arrange
        await showSection('archive');
        await until(ready());
        const id = page()['2']?.id as string;

        // Act
        app.store.set(`${ARCHIVE}.records.${id}.total`, 1234.5);
        await until(() => page()['2']?.total === 1234.5);
        await until(() => deepText(elementAt(PATHS.archiveList)).includes('€1,234.50'));

        // Assert
        expect(page()['2']?.totalText).toBe('€1,234.50');
        expect(app.errors).toEqual([]);
    });
});

describe('Northwind Ops Ridgeline', () => {
    const SCENE = '$.screens.main.children.ridgeline.children.table.children.scene';
    const STATUS = '$.screens.main.children.ridgeline.children.side.children.status.children';
    const BOARD = '$.data.game.board';

    /** Presses a piece (a group3d of the scene) or a tile (a copy of the tiles repeat3d) through its proxy button */
    function pressIn3d(path: string): void {
        const proxy = elementAt(SCENE).shadowRoot?.querySelector<HTMLElement>(`[data-shape-path="${SCENE}.${path}"]`);
        if (!proxy) throw new Error(`no proxy for ${path}`);
        proxy.click();
    }

    async function play(piece: string, tile: string): Promise<void> {
        const moves = app.store.get<number>(`${BOARD}.moves`);
        pressIn3d(`children.${piece}`);
        await until(() => app.store.get(`${BOARD}.picked`) === piece);
        pressIn3d(`children.tiles.rows.${tile}`);
        await until(() => app.store.get(`${BOARD}.moves`) === moves + 1);
    }

    /** The status lines on show, by key */
    const statusShown = (): string[] =>
        ['amberTurn', 'tealTurn', 'amberWon', 'tealWon', 'drawn', 'byBeacon', 'byScouts', 'byStuck', 'byLimit'].filter((key) => isShown(elementAt(`${STATUS}.${key}`)));

    it('should pick a piece, colour its tiles and move it with presses in the 3D scene', async () => {
        // Arrange
        await showSection('ridgeline');
        const scene = elementAt(SCENE);
        await until(() => scene.getAttribute('data-render') === 'ready', 15000);

        // Act
        pressIn3d('children.a2');
        await until(() => app.store.get(`${BOARD}.picked`) === 'a2');
        const legal = app.store.get<string>(`${BOARD}.tiles.t11.paint.color`);
        const haloShown = app.store.get<boolean>(`${BOARD}.halo.visible`);
        pressIn3d('children.tiles.rows.t11');
        await until(() => app.store.get(`${BOARD}.turn`) === 'teal');
        await frame();

        // Assert
        expect(legal).toBe('#45b860');
        expect(haloShown).toBe(true);
        expect(app.store.get(`${BOARD}.last`)).toBe('b1-b2');
        expect(app.store.get(`${SCENE}.children.a2.position`)).toEqual([-1, 0.06, 1]);
        expect(app.store.get('$.data.game.input')).toEqual({ pick: '', to: '', reset: false });
        expect(statusShown()).toEqual(['tealTurn']);
        expect(runErrors()).toEqual([]);
    });

    it('should show the win when the Amber Warden reaches the Teal Beacon', async () => {
        // Arrange
        await showSection('ridgeline');

        // Act: Amber walks its Warden up the board while Teal shuffles a Scout, then the Teal Warden steps off its Beacon
        await play('aW', 't21');
        await play('t1', 't03');
        await play('aW', 't22');
        await play('t1', 't04');
        await play('aW', 't13');
        await play('tW', 't33');
        await play('aW', 't24');

        // Assert
        expect(app.store.get(`${BOARD}.winner`)).toBe('amber');
        expect(app.store.get(`${BOARD}.reason`)).toBe('beacon');
        await until(() => statusShown().join() === 'amberWon,byBeacon');
        expect(runErrors()).toEqual([]);
    });

    it('should start a new game from the New game button', async () => {
        // Arrange
        await showSection('ridgeline');
        await play('a1', 't01');

        // Act
        press('$.screens.main.children.ridgeline.children.side.children.newGame');
        await until(() => app.store.get(`${BOARD}.moves`) === 0);

        // Assert
        expect(app.store.get(`${BOARD}.turn`)).toBe('amber');
        expect(app.store.get(`${BOARD}.pieces.a1.at`)).toEqual([-2, 0.06, 2]);
        expect(app.store.get('$.data.game.input.reset')).toBe(false);
        expect(statusShown()).toEqual(['amberTurn']);
    });
});

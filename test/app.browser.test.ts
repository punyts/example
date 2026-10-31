/**
 * Northwind Ops in a real browser (Vitest browser mode, Chromium through Playwright). Each test mounts the whole app
 * into a fresh host, drives it through the rendered controls where it can, and reads the result from the store and
 * the DOM
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS, startApp } from '../src/bootstrap.ts';
import type { RunningApp } from '../src/bootstrap.ts';
import type { Order } from '../src/data.ts';

const NAV = '$.app.nav.children';
const SETTINGS = '$.app.children.settings.children';
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

async function showSection(name: 'dashboard' | 'orders' | 'customers' | 'settings'): Promise<void> {
    press(`${NAV}.${name}`);
    await until(() => app.store.get(`$.data.view.hidden.${name}`) === false);
    await frame();
}

beforeEach(() => {
    host = document.createElement('div');
    host.style.inlineSize = '1200px';
    document.body.append(host);
    app = startApp(host, { fakeDelay: 20 });
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
        const dashboard = elementAt('$.app.children.dashboard');
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
        const nav = elementAt('$.app.nav');
        expect(deepText(nav)).toContain('Orders');

        // Act
        press(`${SETTINGS}.language.children.choices.children.de`);
        await until(() => deepText(nav).includes('Bestellungen'));

        // Assert
        expect(app.store.get('$.locale')).toBe('de');
        expect(deepText(nav)).not.toContain('Orders');
        expect(deepText(elementAt('$.app.children.settings'))).toContain('Sprache');
        expect(app.errors).toEqual([]);
    });

    it('should change $.theme.active.mode when a theme mode is chosen', async () => {
        // Arrange
        await showSection('settings');
        expect(app.store.get('$.theme.active.mode')).toBe('light');

        // Act
        press(`${SETTINGS}.mode.children.choices.children.dark`);
        await until(() => app.store.get('$.theme.active.mode') === 'dark');
        press(`${SETTINGS}.mode.children.choices.children.contrast`);

        // Assert
        await until(() => app.store.get('$.theme.active.mode') === 'contrast');
        expect(app.errors).toEqual([]);
    });
});

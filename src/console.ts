/**
 * The agent console: plain HTML outside the StateUI host. It stands in for an agent or MCP tool, so every action is
 * only a store write. The application reacts to the data: links, `<-` bindings, the theme step, and the three
 * bridges in bootstrap.ts (`$.locale`, `$.data.requests.toast`, `$.data.requests.jumpTo`)
 */
import type { Store } from '@punyts/state';
import type { AppState } from '@punyts/stateui-app';
import { makeOrder } from './data.ts';
import type { Order } from './data.ts';

export interface ConsoleElements {
    root: HTMLElement;
    log: HTMLElement;
    json: HTMLElement;
    /** Where the UI raises events, so the JSON view refreshes after user interaction too */
    appHost: HTMLElement;
}

/** The small part of the store the JSON view shows; never the 10,000 orders */
export function storeExcerpt(store: Store<AppState>): Record<string, unknown> {
    const orders = store.get<Order[]>('$.data.orders');
    const detail = store.get<Order>('$.data.detail');
    return {
        locale: store.get('$.locale'),
        theme: { active: store.get('$.theme.active'), accent: store.get('$.theme.tokens.color.accent.base') },
        data: {
            view: store.get('$.data.view'),
            ui: store.get('$.data.ui'),
            requests: store.get('$.data.requests'),
            selectedOrder: store.get('$.data.selectedOrder'),
            detail: detail.id === '' ? '(none)' : { id: detail.id, customer: detail.customer, status: detail.status },
            stats: store.get('$.data.stats'),
            orders: `[${orders.length} records]`
        }
    };
}

/** Each action: a label describing the write, and the write itself */
export function consoleActions(store: Store<AppState>): Record<string, { label: string; run(): void }> {
    let agentOrders = 0;
    const showSection = (section: 'dashboard' | 'orders' | 'customers' | 'settings'): void => {
        store.set('$.data.view.section', section);
        for (const name of ['dashboard', 'orders', 'customers', 'settings']) store.set(`$.data.view.hidden.${name}`, name !== section);
    };
    return {
        'add-order': {
            label: 'store.get("$.data.orders").push(order)',
            run() {
                const orders = store.get<Order[]>('$.data.orders');
                agentOrders++;
                orders.push(
                    makeOrder({
                        number: orders.length + 1,
                        customer: { id: 'agent', name: `Agent customer ${agentOrders}`, email: 'agent@example.com' },
                        productKey: 'coffee',
                        quantity: 2,
                        status: 'paid',
                        channel: 'marketplace',
                        priority: 'express',
                        created: '2026-10-31'
                    })
                );
            }
        },
        'ship-order': {
            label: 'store.apply("$.data.orders.<i>", { status: "shipped", ... })',
            run() {
                const orders = store.get<Order[]>('$.data.orders');
                const selected = store.get<string>('$.data.selectedOrder');
                let index = orders.findIndex((order) => order.id === selected && order.status !== 'shipped');
                if (index < 0) index = orders.findIndex((order) => order.status === 'pending' || order.status === 'paid');
                if (index < 0) return;
                store.apply(`$.data.orders.${index}`, { status: 'shipped', statusTone: 'success', progress: 85 });
                store.set('$.data.selectedOrder', String(orders[index]?.id ?? ''));
            }
        },
        german: { label: 'store.set("$.locale", "de")', run: () => void store.set('$.locale', 'de') },
        english: { label: 'store.set("$.locale", "en")', run: () => void store.set('$.locale', 'en') },
        dark: {
            label: 'store.set("$.theme.active.mode", dark | light)',
            run() {
                store.set('$.theme.active.mode', store.get('$.theme.active.mode') === 'dark' ? 'light' : 'dark');
            }
        },
        toast: { label: 'store.set("$.data.requests.toast", "agent")', run: () => void store.set('$.data.requests.toast', 'agent') },
        jump: {
            label: 'show orders, then store.set("$.data.requests.jumpTo", "9000")',
            run() {
                showSection('orders');
                // The list was hidden; give its viewport observer a frame to measure before scrolling
                requestAnimationFrame(() => store.set('$.data.requests.jumpTo', '9000'));
            }
        }
    };
}

export function startConsole(store: Store<AppState>, elements: ConsoleElements): () => void {
    const actions = consoleActions(store);
    const refresh = (): void => {
        elements.json.textContent = JSON.stringify(storeExcerpt(store), null, 2);
    };
    const onClick = (event: Event): void => {
        const name = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset['action'];
        const action = name === undefined ? undefined : actions[name];
        if (!action) return;
        action.run();
        elements.log.textContent = `${action.label}\n-> written; the UI follows the data`;
        queueMicrotask(refresh);
    };
    const onUi = (): void => {
        queueMicrotask(refresh);
    };
    elements.root.addEventListener('click', onClick);
    const uiEvents = ['click', 'change', 'keydown', 'press', 'select', 'submitted', 'close'];
    for (const type of uiEvents) elements.appHost.addEventListener(type, onUi);
    // Timers in the app (fake refresh, forecast) also write; a slow poll keeps the excerpt honest
    const poll = setInterval(refresh, 1000);
    refresh();
    return () => {
        clearInterval(poll);
        elements.root.removeEventListener('click', onClick);
        for (const type of uiEvents) elements.appHost.removeEventListener(type, onUi);
    };
}

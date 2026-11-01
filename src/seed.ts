/**
 * The smaller data sets of Northwind Ops besides the customers and the 10,000 orders: products, the category tree,
 * deliveries, the support threads and the figures of the dashboard charts. They are deterministic like the orders, and
 * they fit in the document's data (512 KiB), so `seedData` puts them there; `scripts/validate.ts` and `bootstrap.ts`
 * both call it, so the validated document is the mounted one.
 *
 * `views.ts` holds the pure functions that derive filtered and paged views of these sets.
 */
import { PRODUCTS, createRandom, formatMoney } from './data.ts';
import type { Customer, Order, OrderStatus } from './data.ts';

export interface Product {
    id: string;
    name: string;
    sku: string;
    category: string;
    categoryLabel: string;
    description: string;
    price: number;
    priceText: string;
    stock: number;
    reorder: boolean;
    visible: boolean;
    lifecycle: 'active' | 'seasonal' | 'discontinued';
}

export interface Category {
    id: string;
    label: string;
    parentId?: string;
    hasChildren?: boolean;
}

export interface Delivery {
    id: string;
    /** The calendar's `titleField` */
    title: string;
    /** The calendar's `startField` and `endField`: ISO dates */
    start: string;
    end: string;
    orderId: string;
    customer: string;
    city: string;
    slot: string;
}

export interface Message {
    id: string;
    author: string;
    text: string;
    time: string;
    streaming?: boolean;
}

export interface Macro {
    id: string;
    name: string;
    body: string;
}

export interface ChartPoint {
    id: string;
    label: string;
    revenue: number;
    orders: number;
}

export interface StatusPoint {
    id: string;
    label: string;
    count: number;
}

export interface RecentOrder {
    id: string;
    /** One line of text: the order, the customer, the status and the total */
    line: string;
}

/** The category tree: the leaves are what a product's `category` names */
export const CATEGORIES: readonly Category[] = [
    { id: 'beverages', label: 'Beverages', hasChildren: true },
    { id: 'tea', label: 'Tea', parentId: 'beverages' },
    { id: 'beer', label: 'Beer', parentId: 'beverages' },
    { id: 'coffee', label: 'Coffee', parentId: 'beverages' },
    { id: 'pantry', label: 'Pantry', hasChildren: true },
    { id: 'syrups', label: 'Syrups and spreads', parentId: 'pantry', hasChildren: true },
    { id: 'jams', label: 'Jams', parentId: 'syrups' },
    { id: 'syrup', label: 'Syrups', parentId: 'syrups' },
    { id: 'spices', label: 'Spices and mixes', parentId: 'pantry' },
    { id: 'dairy', label: 'Dairy', hasChildren: true },
    { id: 'cheese', label: 'Cheese', parentId: 'dairy' }
];

const PRODUCT_FACTS: Readonly<Record<string, { category: string; description: string; stock: number; lifecycle: Product['lifecycle'] }>> = {
    chai: { category: 'tea', description: 'Spiced black tea, 10 boxes of 20 bags.', stock: 39, lifecycle: 'active' },
    chang: { category: 'beer', description: 'Pale lager, 24 bottles of 12 oz.', stock: 17, lifecycle: 'active' },
    syrup: { category: 'syrup', description: 'Aniseed syrup, 12 bottles of 550 ml.', stock: 13, lifecycle: 'seasonal' },
    cajun: { category: 'spices', description: 'Cajun seasoning, 48 jars of 6 oz.', stock: 53, lifecycle: 'active' },
    gumbo: { category: 'spices', description: 'Gumbo mix, 36 boxes.', stock: 0, lifecycle: 'discontinued' },
    marmalade: { category: 'jams', description: 'Seville orange marmalade, 12 jars of 340 g.', stock: 40, lifecycle: 'active' },
    cheese: { category: 'cheese', description: 'Soft cheese from Asturias, 1 kg wheels.', stock: 22, lifecycle: 'active' },
    coffee: { category: 'coffee', description: 'Ipoh white coffee, 16 packs of 500 g.', stock: 8, lifecycle: 'seasonal' }
};

/** One record per entry of `PRODUCTS`, in the same order */
export function generateProducts(): Product[] {
    return Object.entries(PRODUCTS).map(([id, product]) => {
        const facts = PRODUCT_FACTS[id] as (typeof PRODUCT_FACTS)[string];
        return {
            id,
            name: product.name,
            sku: `NW-${id.toUpperCase()}`,
            category: facts.category,
            categoryLabel: CATEGORIES.find((category) => category.id === facts.category)?.label ?? facts.category,
            description: facts.description,
            price: product.price,
            priceText: formatMoney(product.price),
            stock: facts.stock,
            reorder: facts.stock < 15,
            visible: facts.lifecycle !== 'discontinued',
            lifecycle: facts.lifecycle
        };
    });
}

const SLOTS = ['Morning', 'Afternoon', 'Evening'];

/** Deliveries of open orders on the days after `from`, spread over about eight weeks */
export function generateDeliveries(orders: readonly Order[], customers: Readonly<Record<string, Customer>>, count = 64, seed = 99, from = '2026-11-02'): Delivery[] {
    const random = createRandom(seed);
    const open = orders.filter((order) => order.status !== 'cancelled' && order.status !== 'delivered');
    const start = Date.parse(`${from}T00:00:00Z`);
    const deliveries: Delivery[] = [];
    for (let i = 0; i < count; i++) {
        const order = open[Math.floor(random() * open.length)];
        if (!order) break;
        const day = Math.floor(random() * 56);
        const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
        deliveries.push({
            id: `d${String(i + 1).padStart(3, '0')}`,
            title: `${order.label} ${order.product}`,
            start: date,
            end: date,
            orderId: order.id,
            customer: order.customer,
            city: customers[order.customerId]?.city ?? '',
            slot: SLOTS[Math.floor(random() * SLOTS.length)] as string
        });
    }
    return deliveries.sort((a, b) => (a.start === b.start ? a.id.localeCompare(b.id) : a.start.localeCompare(b.start)));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Revenue (without cancelled orders) and order count per month of `created`, for the months that have orders */
export function revenueByMonth(orders: readonly Order[]): ChartPoint[] {
    const months = new Map<number, ChartPoint>();
    for (const order of orders) {
        const month = Number(order.created.slice(5, 7)) - 1;
        const point = months.get(month) ?? { id: `m${String(month + 1).padStart(2, '0')}`, label: MONTHS[month] ?? order.created.slice(0, 7), revenue: 0, orders: 0 };
        point.orders++;
        if (order.status !== 'cancelled') point.revenue += order.total;
        months.set(month, point);
    }
    return [...months.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => ({ ...point, revenue: Math.round(point.revenue) }));
}

export const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
    pending: 'Pending',
    paid: 'Paid',
    packed: 'Packed',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
};

/** Order count per status, in the order of the fulfilment steps */
export function ordersByStatus(orders: readonly Order[]): StatusPoint[] {
    const counts = new Map<OrderStatus, number>();
    for (const order of orders) counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    return (Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => ({ id: status, label: STATUS_LABELS[status], count: counts.get(status) ?? 0 }));
}

/** The latest `count` orders as one-line records for the dashboard list */
export function recentOrders(orders: readonly Order[], count = 6): RecentOrder[] {
    return orders
        .slice(-count)
        .reverse()
        .map((order) => ({
            id: order.id,
            line: `${order.label} ${order.customer} \u00b7 ${order.status} \u00b7 ${order.totalText}`
        }));
}

/** The fulfilment steps in order; the order drawer's stepper shows them */
export const STEPS: readonly OrderStatus[] = ['pending', 'paid', 'packed', 'shipped', 'delivered'];

/** The steps before `status`, which the drawer's stepper marks as completed */
export function completedSteps(status: string): string[] {
    const index = STEPS.indexOf(status as OrderStatus);
    return index < 0 ? [] : STEPS.slice(0, index + (status === 'delivered' ? 1 : 0));
}

/** The earlier conversation with a customer; the text is Markdown */
export function generateHistory(): Message[] {
    return [
        {
            id: 'h1',
            author: 'Ada Andersen',
            time: 'Mon 09:12',
            text: 'Hello, my **order #4** has not arrived yet.\n\n- Ordered: Ipoh coffee\n- Expected: last Friday'
        },
        {
            id: 'h2',
            author: 'Dana (Northwind)',
            time: 'Mon 09:20',
            text: 'Hi Ada, sorry for the wait. I checked the tracking:\n\n1. Packed on Thursday\n2. Handed to the carrier on Friday\n3. Delayed at the depot in `Lyon`\n\nMore on the [carrier page](https://example.com/track/NW-4).'
        },
        {
            id: 'h3',
            author: 'Ada Andersen',
            time: 'Mon 09:31',
            text: 'Thank you. Can you send it again if it is not here by Wednesday?'
        },
        {
            id: 'h4',
            author: 'Dana (Northwind)',
            time: 'Mon 09:33',
            text: '> Resend if not delivered by Wednesday\n\nDone: I added a note to the order, **no further action** needed from you.'
        }
    ];
}

/** The live conversation that `chatView` shows; replies the support agent types are appended by bootstrap.ts */
export function generateChat(): Message[] {
    return [
        { id: 'c1', author: 'Ada Andersen', time: 'Today 10:02', text: 'Hi, the **marmalade** arrived, but one jar is broken.' },
        { id: 'c2', author: 'Dana (Northwind)', time: 'Today 10:04', text: 'I am sorry about that. Could you send a photo? I will arrange a replacement.' }
    ];
}

/** Canned replies; the select's value is the Markdown body, which the preview shows */
export function generateMacros(): Macro[] {
    return [
        {
            id: 'delay',
            name: 'Delivery delay',
            body: '## Delivery delay\n\nThank you for your patience. Your order is **delayed** at the carrier.\n\n- We track it every day\n- We resend it if it is not delivered within *3 working days*'
        },
        {
            id: 'refund',
            name: 'Refund issued',
            body: '## Refund issued\n\nWe refunded the order to your original payment method.\n\n| Step | Time |\n| --- | --- |\n| Refund sent | today |\n| Shown in your bank | 3 to 5 days |'
        },
        {
            id: 'damaged',
            name: 'Damaged item',
            body: '## Damaged item\n\nWe are sorry. Please reply with a photo of the item and the label.\n\n> A replacement ships the same day we receive the photo.'
        }
    ];
}

/** The reply a customer "types" after the agent writes; bootstrap.ts streams it into one record chunk by chunk */
export const CUSTOMER_REPLY =
    'Thanks, that was quick. I sent the photo to **support@northwind.example**.\n\n- Jar broken: *1 of 12*\n- Rest of the box: fine';

export interface TopCustomer {
    id: string;
    name: string;
    city: string;
    orders: number;
    spend: number;
}

/** The five customers with the highest spend, cancelled orders excluded */
export function topCustomers(orders: readonly Order[], customers: Readonly<Record<string, Customer>>, count = 5): TopCustomer[] {
    const spend = new Map<string, { orders: number; spend: number }>();
    for (const order of orders) {
        if (order.status === 'cancelled') continue;
        const entry = spend.get(order.customerId) ?? { orders: 0, spend: 0 };
        entry.orders++;
        entry.spend += order.total;
        spend.set(order.customerId, entry);
    }
    return [...spend.entries()]
        .filter(([id]) => customers[id] !== undefined)
        .sort((a, b) => b[1].spend - a[1].spend || a[0].localeCompare(b[0]))
        .slice(0, count)
        .map(([id, entry]) => ({ id, name: customers[id]?.name ?? '', city: customers[id]?.city ?? '', orders: entry.orders, spend: Math.round(entry.spend) }));
}

export interface Preferences {
    displayName: string;
    email: string;
    accent: string;
    language: string;
    mode: string;
    motion: string;
    density: string;
    notify: { shipped: boolean; cancelled: boolean; express: boolean };
    digest: { daily: boolean; weekly: boolean };
    digestTime: string;
}

export function defaultPreferences(): Preferences {
    return {
        displayName: 'Dana Whitfield',
        email: 'dana@northwind.example',
        accent: 'blue',
        language: 'en',
        mode: 'light',
        motion: 'full',
        density: 'comfortable',
        notify: { shipped: true, cancelled: true, express: false },
        digest: { daily: true, weekly: false },
        digestTime: '08:00'
    };
}

/** Everything `seedData` adds to the document's `data` */
export function seedData(orders: readonly Order[], customers: Readonly<Record<string, Customer>>): Record<string, unknown> {
    const products = generateProducts();
    const deliveries = generateDeliveries(orders, customers);
    const customerOptions = [...new Set(Object.values(customers).map((customer) => customer.name))].sort().map((name) => ({ name }));
    return {
        customers,
        categories: CATEGORIES,
        customerOptions,
        productOptions: products.map((product) => ({ id: product.id, name: product.name })),
        products: { all: products, draft: emptyProductDraft() },
        catalog: { category: '', items: products, selected: '', trail: { catalog: { _label: 'Catalog' } } },
        deliveries: { all: deliveries, shown: deliveries, rows: deliveries.slice(0, 6), range: { start: '', end: '' }, page: 1, pageSize: 6, total: deliveries.length, dayText: '' },
        support: { history: generateHistory(), macros: generateMacros(), macro: (generateMacros()[0] as Macro).body, note: '', reason: '', details: '' },
        chat: { messages: generateChat() },
        charts: { byMonth: revenueByMonth(orders), byStatus: ordersByStatus(orders) },
        recent: recentOrders(orders),
        topCustomers: topCustomers(orders, customers),
        prefs: defaultPreferences()
    };
}

export function emptyProductDraft(): Record<string, unknown> {
    return { id: '', name: '', category: 'tea', price: '', stock: '' };
}

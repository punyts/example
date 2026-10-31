/**
 * Deterministic demo data for Northwind Ops. The same seed always gives the same customers and orders, so the tests
 * can name order 9000 and the screenshots stay stable
 */

export type OrderStatus = 'pending' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
export type Tone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info';

export interface Customer {
    id: string;
    name: string;
    email: string;
    city: string;
    tier: string;
    tierTone: Tone;
}

export interface Order {
    /** The record key the recordList uses (`key: "id"`); the order number as text */
    id: string;
    number: number;
    label: string;
    customerId: string;
    customer: string;
    email: string;
    product: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
    totalText: string;
    status: OrderStatus;
    statusTone: Tone;
    channel: string;
    priority: string;
    created: string;
    shipped: string;
    progress: number;
}

export const ORDER_COUNT = 10_000;
export const CUSTOMER_COUNT = 240;

export const STATUS_TONES: Readonly<Record<OrderStatus, Tone>> = {
    pending: 'warning',
    paid: 'info',
    packed: 'accent',
    shipped: 'success',
    delivered: 'neutral',
    cancelled: 'danger'
};

export const STATUS_PROGRESS: Readonly<Record<OrderStatus, number>> = {
    pending: 10,
    paid: 35,
    packed: 60,
    shipped: 85,
    delivered: 100,
    cancelled: 0
};

/** The product list; the keys are also the options of the new-order form */
export const PRODUCTS: Readonly<Record<string, { name: string; price: number }>> = {
    chai: { name: 'Chai tea', price: 18 },
    chang: { name: 'Chang beer', price: 19 },
    syrup: { name: 'Aniseed syrup', price: 10 },
    cajun: { name: 'Cajun seasoning', price: 22 },
    gumbo: { name: 'Gumbo mix', price: 21.35 },
    marmalade: { name: 'Sir Rodney\'s marmalade', price: 81 },
    cheese: { name: 'Queso Cabrales', price: 21 },
    coffee: { name: 'Ipoh coffee', price: 46 }
};

const FIRST = ['Ada', 'Bruno', 'Clara', 'Diego', 'Elena', 'Femi', 'Greta', 'Hiro', 'Ines', 'Jonas', 'Kara', 'Liam', 'Maya', 'Nils', 'Olga', 'Pavel'];
const LAST = ['Andersen', 'Berg', 'Costa', 'Dubois', 'Eriksen', 'Fischer', 'Garcia', 'Huber', 'Ivanova', 'Jensen', 'Keller', 'Lopez', 'Moreau', 'Novak', 'Okafor'];
const CITIES = ['Berlin', 'Lisbon', 'Lyon', 'Oslo', 'Vienna', 'Madrid', 'Graz', 'Bern', 'Aarhus', 'Turin'];
const TIERS: readonly [string, Tone][] = [
    ['Gold', 'warning'],
    ['Silver', 'neutral'],
    ['Bronze', 'accent']
];
const CHANNELS = ['web', 'phone', 'marketplace'];
const STATUSES: readonly OrderStatus[] = ['pending', 'paid', 'packed', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled'];

/** mulberry32: a small seeded PRNG, good enough for demo data */
export function createRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick<T>(random: () => number, list: readonly T[]): T {
    return list[Math.floor(random() * list.length)] as T;
}

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' });
export const formatMoney = (value: number): string => money.format(value);

const isoDay = (start: number, days: number): string => new Date(start + days * 86_400_000).toISOString().slice(0, 10);

/** `count` customers keyed `c001`, `c002`, ... (string keys keep insertion order and pass `SUI-DOC-ORDER`) */
export function generateCustomers(count = CUSTOMER_COUNT, seed = 7): Record<string, Customer> {
    const random = createRandom(seed);
    const customers: Record<string, Customer> = {};
    for (let i = 1; i <= count; i++) {
        const id = `c${String(i).padStart(3, '0')}`;
        const name = `${pick(random, FIRST)} ${pick(random, LAST)}`;
        const [tier, tierTone] = pick(random, TIERS);
        customers[id] = {
            id,
            name,
            email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
            city: pick(random, CITIES),
            tier,
            tierTone
        };
    }
    return customers;
}

/** Builds one order record; also used for orders created in the form and by the agent console */
export function makeOrder(input: {
    number: number;
    customer: Customer | { id: string; name: string; email: string };
    productKey: string;
    quantity: number;
    status: OrderStatus;
    channel: string;
    priority: string;
    created: string;
    shipped?: string;
}): Order {
    const product = PRODUCTS[input.productKey] ?? (PRODUCTS['chai'] as { name: string; price: number });
    const total = Math.round(product.price * input.quantity * 100) / 100;
    return {
        id: String(input.number),
        number: input.number,
        label: `#${input.number}`,
        customerId: input.customer.id,
        customer: input.customer.name,
        email: input.customer.email,
        product: product.name,
        sku: `NW-${input.productKey.toUpperCase()}`,
        quantity: input.quantity,
        unitPrice: product.price,
        total,
        totalText: formatMoney(total),
        status: input.status,
        statusTone: STATUS_TONES[input.status],
        channel: input.channel,
        priority: input.priority,
        created: input.created,
        shipped: input.shipped ?? '',
        progress: STATUS_PROGRESS[input.status]
    };
}

/** `count` orders numbered 1 to `count`, as an array whose records carry their key in `id` */
export function generateOrders(customers: Readonly<Record<string, Customer>>, count = ORDER_COUNT, seed = 42): Order[] {
    const random = createRandom(seed);
    const list = Object.values(customers);
    const productKeys = Object.keys(PRODUCTS);
    const start = Date.UTC(2026, 0, 1);
    const orders: Order[] = new Array<Order>(count);
    for (let i = 0; i < count; i++) {
        const status = pick(random, STATUSES);
        const day = Math.floor((i / count) * 300);
        orders[i] = makeOrder({
            number: i + 1,
            customer: pick(random, list),
            productKey: pick(random, productKeys),
            quantity: 1 + Math.floor(random() * 12),
            status,
            channel: pick(random, CHANNELS),
            priority: random() < 0.15 ? 'express' : 'standard',
            created: isoDay(start, day),
            shipped: status === 'shipped' || status === 'delivered' ? isoDay(start, day + 2) : ''
        });
    }
    return orders;
}

export interface Stats {
    revenue: number;
    revenueDelta: number;
    orders: number;
    customers: number;
    pending: number;
    express: number;
    cancelled: number;
    fulfilled: number;
    top: { name: string; city: string; orders: number; spend: number };
}

/** The dashboard figures, computed from the orders */
export function computeStats(orders: readonly Order[], customers: Readonly<Record<string, Customer>>): Stats {
    let revenue = 0;
    let recent = 0;
    let pending = 0;
    let express = 0;
    let cancelled = 0;
    let fulfilled = 0;
    const spend = new Map<string, { orders: number; spend: number }>();
    const active = new Set<string>();
    const recentFrom = orders.length - Math.floor(orders.length / 10);
    orders.forEach((order, index) => {
        if (order.status === 'cancelled') {
            cancelled++;
            return;
        }
        revenue += order.total;
        if (index >= recentFrom) recent += order.total;
        if (order.status === 'pending') pending++;
        if (order.status === 'pending' && order.priority === 'express') express++;
        if (order.status === 'shipped' || order.status === 'delivered') fulfilled++;
        active.add(order.customerId);
        const entry = spend.get(order.customerId) ?? { orders: 0, spend: 0 };
        entry.orders++;
        entry.spend += order.total;
        spend.set(order.customerId, entry);
    });
    let topId = '';
    let topSpend = -1;
    for (const [id, entry] of spend) {
        if (entry.spend > topSpend) {
            topSpend = entry.spend;
            topId = id;
        }
    }
    const topCustomer = customers[topId];
    const topEntry = spend.get(topId) ?? { orders: 0, spend: 0 };
    const counted = orders.length - cancelled;
    return {
        revenue: Math.round(revenue),
        revenueDelta: Math.round(recent),
        orders: orders.length,
        customers: active.size,
        pending,
        express,
        cancelled,
        fulfilled: counted === 0 ? 0 : Math.round((fulfilled / counted) * 100),
        top: {
            name: topCustomer?.name ?? '',
            city: topCustomer?.city ?? '',
            orders: topEntry.orders,
            spend: Math.round(topEntry.spend)
        }
    };
}

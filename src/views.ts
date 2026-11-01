/**
 * Pure helpers that derive the views of the small data sets: the deliveries inside a date range and one page of them,
 * the products of a category and the breadcrumb trail to it. `bootstrap.ts` runs them when the
 * data they read changes and writes the results back into `$.data`; they touch no store, so the tests call them directly
 */
import type { Category, Delivery, Product } from './seed.ts';

export interface DateRange {
    start: string;
    end: string;
}

/** The deliveries whose day is inside the range; an empty end of the range leaves that side open */
export function filterDeliveries(all: readonly Delivery[], range: DateRange): Delivery[] {
    return all.filter((delivery) => (range.start === '' || delivery.start >= range.start) && (range.end === '' || delivery.start <= range.end));
}

/** The 1-based `page` of `items`; a page past the last shows the last, and a page below 1 the first */
export function pageOf<T>(items: readonly T[], page: number, pageSize: number): T[] {
    const size = Math.max(1, Math.floor(pageSize));
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.min(Math.max(1, Math.floor(page)), pages);
    return items.slice((current - 1) * size, current * size);
}

/** `id` and the ids of every category below it */
export function categorySubtree(categories: readonly Category[], id: string): Set<string> {
    const ids = new Set<string>([id]);
    let grown = true;
    while (grown) {
        grown = false;
        for (const category of categories) {
            if (category.parentId !== undefined && ids.has(category.parentId) && !ids.has(category.id)) {
                ids.add(category.id);
                grown = true;
            }
        }
    }
    return ids;
}

/** The products of a category and of the categories below it; an empty `id` is every product */
export function productsInCategory(products: readonly Product[], categories: readonly Category[], id: string): Product[] {
    if (id === '') return [...products];
    const ids = categorySubtree(categories, id);
    return products.filter((product) => ids.has(product.category));
}

/** The breadcrumb `items` map: the root, then each category from the top one down to `id` */
export function categoryTrail(categories: readonly Category[], id: string, rootLabel: string): Record<string, { _label: string }> {
    const chain: Category[] = [];
    const byId = new Map(categories.map((category) => [category.id, category]));
    let current = byId.get(id);
    while (current && chain.length < categories.length) {
        chain.unshift(current);
        current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    const trail: Record<string, { _label: string }> = { catalog: { _label: rootLabel } };
    for (const category of chain) trail[category.id] = { _label: category.label };
    return trail;
}

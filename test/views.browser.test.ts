/**
 * The pure view helpers and the seeded data sets, without mounting the app
 */
import { describe, expect, it } from 'vitest';
import { generateCustomers, generateOrders } from '../src/data.ts';
import { CATEGORIES, completedSteps, generateDeliveries, generateProducts, ordersByStatus, revenueByMonth, topCustomers } from '../src/seed.ts';
import { categorySubtree, categoryTrail, filterDeliveries, pageOf, productsInCategory } from '../src/views.ts';

const customers = generateCustomers();
const orders = generateOrders(customers, 1000);

describe('seed data', () => {
    it('should give the same deliveries for the same seed', () => {
        // Arrange and Act
        const first = generateDeliveries(orders, customers);
        const second = generateDeliveries(orders, customers);

        // Assert
        expect(first).toEqual(second);
        expect(first).toHaveLength(64);
    });

    it('should total every order by status and sum revenue without cancelled orders', () => {
        // Arrange and Act
        const statuses = ordersByStatus(orders);
        const months = revenueByMonth(orders);

        // Assert
        expect(statuses.reduce((sum, point) => sum + point.count, 0)).toBe(orders.length);
        const expected = orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.total, 0);
        expect(Math.abs(months.reduce((sum, point) => sum + point.revenue, 0) - expected)).toBeLessThan(months.length);
    });

    it('should rank the top customers by spend', () => {
        // Arrange and Act
        const top = topCustomers(orders, customers, 3);

        // Assert
        expect(top).toHaveLength(3);
        expect(top[0]?.spend).toBeGreaterThanOrEqual(top[1]?.spend ?? 0);
    });

    it('should mark the steps before the status as completed', () => {
        // Arrange, Act and Assert
        expect(completedSteps('pending')).toEqual([]);
        expect(completedSteps('packed')).toEqual(['pending', 'paid']);
        expect(completedSteps('delivered')).toHaveLength(5);
        expect(completedSteps('cancelled')).toEqual([]);
    });
});

describe('views', () => {
    it('should keep the deliveries inside the date range and leave an empty side open', () => {
        // Arrange
        const deliveries = generateDeliveries(orders, customers);

        // Act
        const from = filterDeliveries(deliveries, { start: '2026-11-20', end: '' });
        const between = filterDeliveries(deliveries, { start: '2026-11-10', end: '2026-11-12' });

        // Assert
        expect(from.every((delivery) => delivery.start >= '2026-11-20')).toBe(true);
        expect(between.every((delivery) => delivery.start >= '2026-11-10' && delivery.start <= '2026-11-12')).toBe(true);
        expect(filterDeliveries(deliveries, { start: '', end: '' })).toHaveLength(deliveries.length);
    });

    it('should clamp the page to the first and the last', () => {
        // Arrange
        const items = [1, 2, 3, 4, 5];

        // Act and Assert
        expect(pageOf(items, 1, 2)).toEqual([1, 2]);
        expect(pageOf(items, 3, 2)).toEqual([5]);
        expect(pageOf(items, 9, 2)).toEqual([5]);
        expect(pageOf(items, 0, 2)).toEqual([1, 2]);
    });

    it('should list the products of a category and of the categories below it', () => {
        // Arrange
        const products = generateProducts();

        // Act
        const beverages = productsInCategory(products, CATEGORIES, 'beverages').map((product) => product.id);
        const pantry = productsInCategory(products, CATEGORIES, 'pantry').map((product) => product.id);

        // Assert
        expect(beverages).toEqual(['chai', 'chang', 'coffee']);
        expect(pantry).toEqual(['syrup', 'cajun', 'gumbo', 'marmalade']);
        expect(productsInCategory(products, CATEGORIES, '')).toHaveLength(products.length);
        expect([...categorySubtree(CATEGORIES, 'syrups')].sort()).toEqual(['jams', 'syrup', 'syrups']);
    });

    it('should build the breadcrumb trail from the root down to the category', () => {
        // Arrange and Act
        const trail = categoryTrail(CATEGORIES, 'jams', 'Catalog');

        // Assert
        expect(Object.keys(trail)).toEqual(['catalog', 'pantry', 'syrups', 'jams']);
        expect(trail['jams']?._label).toBe('Jams');
        expect(Object.keys(categoryTrail(CATEGORIES, '', 'Catalog'))).toEqual(['catalog']);
    });

});

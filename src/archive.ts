/**
 * The order archive: a fake paged API behind the archive section's effect, and the compute function that formats
 * money. The document holds the logic (`app.json` `logic`): an effect `fetchArchive` that asks `$.functions.host.archiveFetch` for the
 * page in `$.data.archive.request`, merges the records into `$.data.archive.records` by `id` and shows them in the
 * section's record list; a compute unit that writes each record's `totalText` with `$.functions.host.moneyFormat`; and a table that
 * turns the effect's status into a badge. The code here only answers requests, like a server would
 */
import type { HostFunction, JsonValue, LogicComputeFunction, LogicEffectAnswer, LogicEffectFunction } from '@punyts/stateui-app';
import { formatMoney } from './data.ts';
import type { Order } from './data.ts';

/** How many orders the archive holds */
export const ARCHIVE_SIZE = 95;

/** The page size the archive answers when a request names none */
const DEFAULT_PAGE_SIZE = 10;

export interface ArchiveApi {
    /** The host functions it answers with, for `hostCatalog` */
    readonly functions: Readonly<Record<string, HostFunction>>;
    /** Every request the API was asked, in order */
    readonly requests: JsonValue[];
    /** How many requests a newer one aborted */
    aborted: number;
    /** How long an answer takes, in ms */
    delay: number;
}

function archiveRecord(order: Order): JsonValue {
    return { id: order.id, label: order.label, customer: order.customer, product: order.product, total: order.total, status: order.status, statusTone: order.statusTone };
}

/** A fake archive of the oldest `ARCHIVE_SIZE` orders that answers `{ page, size }` after `delay` ms and stops on abort */
export function createArchiveApi(orders: readonly Order[], delay: number): ArchiveApi {
    const archive = orders.slice(0, ARCHIVE_SIZE).map(archiveRecord);
    const api: ArchiveApi = {
        requests: [],
        aborted: 0,
        delay,
        functions: {
            moneyFormat: {
                id: '94fd2552-5b10-4dc7-8b77-b2961992ae7f',
                kind: 'compute',
                summary: 'Formats { amount } as money in { text }',
                code: ((inputs) => ({ text: typeof inputs['amount'] === 'number' ? formatMoney(inputs['amount']) : '' })) as LogicComputeFunction
            },
            archiveFetch: {
                id: 'edf0b4d2-f22d-44be-bd9b-4fbefb47b869',
                kind: 'effect',
                summary: 'Answers a page { page, size } of the order archive',
                code: ((request, { signal }) => {
                    api.requests.push(request);
                    const query = (request ?? {}) as { page?: number; size?: number };
                    const size = Math.max(1, query.size ?? DEFAULT_PAGE_SIZE);
                    const first = (Math.max(1, query.page ?? 1) - 1) * size;
                    const answer: LogicEffectAnswer = { first, total: archive.length, records: archive.slice(first, first + size) };
                    return new Promise((resolve, reject) => {
                        const timer = setTimeout(() => resolve(answer), api.delay);
                        signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            api.aborted += 1;
                            reject(new Error('aborted'));
                        });
                    });
                }) as LogicEffectFunction
            }
        }
    };
    return api;
}

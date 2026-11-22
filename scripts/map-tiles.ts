/**
 * Writes the sample map tiles the Deliveries screen's `map` draws: `public/map-tiles/{z}/{x}/{y}.png` for zooms 0 to 3,
 * each a 256 pixel Web Mercator tile of a graticule (a line every 10 degrees, the equator and the prime meridian
 * stronger). They stand in for the tiles our server's tile route serves, so the example needs no outside tile host.
 * Run with `npm run tiles` after changing the drawing
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'map-tiles');
const SIZE = 256;
const MAX_ZOOM = 3;
const STEP = 10;

type Rgb = readonly [number, number, number];
const WATER: Rgb = [226, 236, 242];
const LINE: Rgb = [184, 202, 214];
const AXIS: Rgb = [120, 150, 170];

function png(pixels: Uint8Array): Buffer {
    const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) {
        raw[y * (SIZE * 3 + 1)] = 0;
        raw.set(pixels.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), y * (SIZE * 3 + 1) + 1);
    }
    const chunk = (type: string, data: Buffer): Buffer => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body));
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0);
    header.writeUInt32BE(SIZE, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The world pixel row of a latitude at a zoom */
function rowOf(lat: number, world: number): number {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * world;
}

function tile(z: number, x: number, y: number): Buffer {
    const world = SIZE * 2 ** z;
    const pixels = new Uint8Array(SIZE * SIZE * 3);
    for (let i = 0; i < SIZE * SIZE; i++) pixels.set(WATER, i * 3);
    const paint = (px: number, py: number, colour: Rgb): void => {
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) pixels.set(colour, (py * SIZE + px) * 3);
    };
    for (let lng = -180; lng <= 180; lng += STEP) {
        const px = Math.round(((lng + 180) / 360) * world) - x * SIZE;
        for (let py = 0; py < SIZE; py++) paint(px, py, lng === 0 ? AXIS : LINE);
    }
    for (let lat = -80; lat <= 80; lat += STEP) {
        const py = Math.round(rowOf(lat, world)) - y * SIZE;
        for (let px = 0; px < SIZE; px++) paint(px, py, lat === 0 ? AXIS : LINE);
    }
    return png(pixels);
}

rmSync(ROOT, { recursive: true, force: true });
for (let z = 0; z <= MAX_ZOOM; z++) {
    for (let x = 0; x < 2 ** z; x++) {
        const folder = join(ROOT, String(z), String(x));
        mkdirSync(folder, { recursive: true });
        for (let y = 0; y < 2 ** z; y++) writeFileSync(join(folder, `${y}.png`), tile(z, x, y));
    }
}
console.log(`wrote zooms 0 to ${MAX_ZOOM} into ${ROOT}`);

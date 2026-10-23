import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Reuse the existing MIT-licensed Tabler train; see public/tabler-license.txt.
const favicon = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const trainPaths = favicon.match(/<path[\s\S]*<\/path>/)?.[0];
if (!trainPaths) throw new Error('The favicon must contain the train paths.');

const fullBleedIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#22231f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="24" height="24" fill="#f6d522" stroke="none"/><g transform="translate(3 3) scale(.75)">${trainPaths}</g></svg>`;
const output = new URL('../public/icons/', import.meta.url);
const icons = [
    { filename: 'app-192.png', size: 192, svg: favicon },
    { filename: 'app-512.png', size: 512, svg: favicon },
    { filename: 'app-maskable-512.png', size: 512, svg: fullBleedIcon },
    { filename: 'apple-touch-icon.png', size: 180, svg: fullBleedIcon }
];
const browser = await chromium.launch({
    channel: process.env.QA_BROWSER_CHANNEL || 'msedge',
    headless: true
});

try {
    await mkdir(output, { recursive: true });
    const page = await browser.newPage();
    for (const { filename, size, svg } of icons) {
        const png = await page.evaluate(async ({ svg, size }) => {
            const source = new Image();
            source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
            await source.decode();
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            canvas.getContext('2d').drawImage(source, 0, 0, size, size);
            return canvas.toDataURL('image/png').split(',')[1];
        }, { svg, size });
        await writeFile(new URL(filename, output), Buffer.from(png, 'base64'));
        console.log(`Generated ${filename} (${size} × ${size}).`);
    }
} finally {
    await browser.close();
}

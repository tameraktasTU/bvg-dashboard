import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const output = new URL('../docs/screenshots/', import.meta.url);
const api = 'https://v6.bvg.transport.rest';
const browser = await chromium.launch({
    channel: process.env.QA_BROWSER_CHANNEL || 'msedge',
    headless: true
});
const errors = [];

await mkdir(output, { recursive: true });

async function findStation(query) {
    const params = new URLSearchParams({ query, results: '1', stops: 'true', addresses: 'false', poi: 'false' });
    const response = await fetch(`${api}/locations?${params}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Station search failed: ${response.status}`);
    const results = await response.json();
    const station = results[0];
    assert.ok(station?.type === 'stop' && station.id, `No station found for ${query}.`);
    return station;
}

async function navigate(page, name) {
    const buttons = await page.getByRole('button', { name, exact: true }).all();
    for (const button of buttons) {
        if (await button.isVisible()) {
            await button.click();
            return;
        }
    }
    throw new Error(`No visible navigation button: ${name}`);
}

async function capture(page, filename) {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.switch-enter-active, .switch-leave-active, .journey-detail-enter-active')).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, [], 'Screenshots must not contain runtime errors.');
    await page.screenshot({ path: fileURLToPath(new URL(filename, output)), fullPage: false });
    console.log(`Captured ${filename}`);
}

async function openPage(theme, view, stations) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 2,
        locale: 'en-GB', timezoneId: 'Europe/Berlin', colorScheme: theme, reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ theme, view, origin, destination, stop }) => {
        localStorage.setItem('theme', theme);
        localStorage.setItem('currentView', view);
        localStorage.setItem('journeyOrigin', JSON.stringify(origin));
        localStorage.setItem('journeyDestination', JSON.stringify(destination));
        localStorage.setItem('selectedStop', JSON.stringify(stop));
        localStorage.setItem('selectedDuration', '60');
    }, { theme, view, ...stations });
    await page.goto(baseUrl);
    await expect(page.locator('body')).toHaveCSS('color', theme === 'dark' ? 'rgb(244, 244, 240)' : 'rgb(34, 35, 31)');
    return { context, page };
}

try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    const [origin, destination, stop] = await Promise.all([
        findStation('Eberswalder'), findStation('Hermannplatz'), findStation('Berlin Hauptbahnhof')
    ]);
    const stations = { origin, destination, stop };

    // Capture the real application and live API responses. No fixtures, mocked
    // responses, clock replacement or screenshot-specific application styles.
    const planner = await openPage('dark', 'journey', stations);
    const tomorrow = new Date(Date.now() + 86400000);
    const date = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(tomorrow);
    await planner.page.getByRole('textbox', { name: 'Journey date', exact: true }).fill(date);
    await planner.page.getByRole('textbox', { name: 'Journey time', exact: true }).fill('09:41');
    await planner.page.getByRole('button', { name: 'Find journeys', exact: true }).click();
    const firstJourney = planner.page.getByRole('button', { name: /^View journey 1 details/ });
    await expect(firstJourney).toBeVisible({ timeout: 45000 });
    await planner.page.evaluate(() => window.scrollTo(0, 0));
    await capture(planner.page, 'desktop-journeys.png');

    await planner.page.setViewportSize({ width: 390, height: 844 });
    await planner.page.evaluate(() => window.scrollTo(0, 0));
    await capture(planner.page, 'mobile-journeys.png');
    await planner.context.close();

    const dark = await openPage('dark', 'departures', stations);
    const table = dark.page.getByRole('table', { name: 'Departures', exact: true });
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 45000 });
    await capture(dark.page, 'desktop-departures.png');

    await dark.page.setViewportSize({ width: 390, height: 844 });
    await table.locator('..').evaluate((panel) => {
        window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY, behavior: 'instant' });
    });
    await capture(dark.page, 'mobile-departures.png');

    const tram = table.locator('tbody tr').filter({ has: dark.page.getByText('M10', { exact: true }) }).first();
    await expect(tram).toBeVisible();
    await tram.click();
    const route = dark.page.getByRole('dialog', { name: 'Line overview', exact: true });
    await expect(route.locator('ol > li').first()).toBeVisible({ timeout: 45000 });
    await expect(route.locator('[data-current-stop]')).toBeInViewport();
    await route.getByRole('heading', { name: 'Line overview', exact: true }).click();
    await capture(dark.page, 'mobile-line-overview.png');
    await dark.context.close();
    console.log('Five actual browser screenshots saved to docs/screenshots/. Timetables are captured examples.');
} finally {
    await browser.close();
}

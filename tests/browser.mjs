import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const screenshotDirectory = new URL('../.qa/', import.meta.url);
const browser = await chromium.launch({
    channel: process.env.QA_BROWSER_CHANNEL || 'msedge',
    headless: true
});
let activePage = null;

await mkdir(screenshotDirectory, { recursive: true });

const stop = {
    type: 'stop',
    id: '900100003',
    name: 'S+U Alexanderplatz',
    location: { type: 'location', latitude: 52.5215, longitude: 13.4113 },
    products: { subway: true, suburban: true, tram: true, bus: true }
};
const destination = {
    type: 'stop',
    id: '900023201',
    name: 'S+U Zoologischer Garten',
    location: { type: 'location', latitude: 52.507, longitude: 13.3327 },
    products: { subway: true, suburban: true, bus: true }
};
const interchange = {
    type: 'stop',
    id: '900100001',
    name: 'S+U Friedrichstraße',
    location: { type: 'location', latitude: 52.5203, longitude: 13.3871 }
};
const u5 = {
    type: 'line',
    id: 'u5',
    name: 'U5',
    product: 'subway',
    mode: 'train'
};
const s3 = {
    type: 'line',
    id: 's3',
    name: 'S3',
    product: 'suburban',
    mode: 'train'
};

function createFixtures() {
    const now = Date.now();
    const time = (minutes) => new Date(now + minutes * 60000).toISOString();
    const departure = (minutes, line, tripId, direction, extra = {}) => ({
        tripId,
        stop,
        line,
        direction,
        when: time(minutes),
        plannedWhen: time(minutes),
        delay: 0,
        platform: '1',
        ...extra
    });
    const departures = [
        departure(-2, u5, 'expired-trip', 'Expired departure'),
        departure(2, u5, 'mock-u5', 'Hönow', {
            plannedWhen: time(0),
            delay: 120
        }),
        departure(18, s3, 'mock-s3', 'Spandau', {
            plannedWhen: time(19),
            delay: -60
        }),
        departure(42, { name: 'M4', product: 'tram' }, 'mock-m4', 'Falkenberg')
    ];
    const transitLeg = (origin, target, line, start, end, extra = {}) => ({
        origin,
        destination: target,
        line,
        direction: target.name,
        departure: time(start),
        plannedDeparture: time(start),
        arrival: time(end),
        plannedArrival: time(end),
        departureDelay: 0,
        arrivalDelay: 0,
        departurePlatform: '1',
        arrivalPlatform: '2',
        stopovers: [
            {
                stop: origin,
                departure: time(start),
                plannedDeparture: time(start)
            },
            { stop: target, arrival: time(end), plannedArrival: time(end) }
        ],
        ...extra
    });

    return {
        departures,
        journeys: [
            {
                type: 'journey',
                legs: [
                    transitLeg(stop, interchange, u5, 3, 12, {
                        plannedDeparture: time(1),
                        departureDelay: 120,
                        plannedDeparturePlatform: '4',
                        stopovers: [
                            { stop, departure: time(3), plannedDeparture: time(1), departureDelay: 120 },
                            {
                                stop: { id: '900100008', name: 'Museumsinsel' },
                                arrival: time(7),
                                plannedArrival: time(5),
                                arrivalDelay: 120,
                                departure: time(7),
                                plannedDeparture: time(5),
                                departureDelay: 120
                            },
                            { stop: interchange, arrival: time(12), plannedArrival: time(12) }
                        ]
                    }),
                    {
                        origin: interchange,
                        destination: interchange,
                        walking: true,
                        mode: 'walking',
                        distance: 180,
                        departure: time(12),
                        arrival: time(15)
                    },
                    transitLeg(interchange, destination, s3, 17, 30)
                ]
            },
            {
                type: 'journey',
                legs: [transitLeg(stop, destination, s3, 9, 34)]
            }
        ],
        journeyVariants: {
            samePlatform: [{
                type: 'journey',
                legs: [
                    transitLeg(stop, interchange, u5, 3, 12),
                    transitLeg(interchange, destination, s3, 16, 30, { departurePlatform: '2' })
                ]
            }],
            differentPlatforms: [{
                type: 'journey',
                legs: [
                    transitLeg(stop, interchange, u5, 3, 12),
                    transitLeg(interchange, destination, s3, 16, 30, { departurePlatform: '7' })
                ]
            }],
            accessWalks: [{
                type: 'journey',
                legs: [
                    {
                        origin: { type: 'location', name: 'Alexanderplatz entrance' },
                        destination: stop,
                        walking: true,
                        distance: 120,
                        departure: time(0),
                        arrival: time(2)
                    },
                    transitLeg(stop, destination, s3, 3, 25),
                    {
                        origin: destination,
                        destination: { type: 'location', name: 'Hardenbergplatz entrance' },
                        walking: true,
                        distance: 200,
                        departure: time(25),
                        arrival: time(29)
                    }
                ]
            }],
            missingFields: [{
                type: 'journey',
                legs: [
                    transitLeg(stop, interchange, u5, 3, 12, {
                        departure: undefined,
                        arrival: undefined,
                        departurePlatform: undefined,
                        arrivalPlatform: undefined,
                        stopovers: undefined
                    }),
                    {
                        origin: interchange,
                        destination: interchange,
                        walking: true,
                        plannedDeparture: time(12),
                        plannedArrival: time(15)
                    },
                    transitLeg(interchange, destination, s3, 17, 30, {
                        departurePlatform: undefined,
                        arrivalPlatform: undefined,
                        stopovers: undefined
                    })
                ]
            }],
            missedConnection: [{
                type: 'journey',
                legs: [
                    transitLeg(stop, interchange, u5, 3, 19, {
                        plannedArrival: time(12),
                        arrivalDelay: 420
                    }),
                    transitLeg(interchange, destination, s3, 17, 30)
                ]
            }],
            cancelledConnection: [{
                type: 'journey',
                legs: [
                    transitLeg(stop, interchange, u5, 3, 12),
                    transitLeg(interchange, destination, s3, 17, 30, { cancelled: true })
                ]
            }]
        },
        trip: {
            id: 'mock-u5',
            line: u5,
            direction: 'Hönow',
            stopovers: [
                {
                    stop: { id: '900100002', name: 'Rotes Rathaus' },
                    departure: time(-1),
                    plannedDeparture: time(-1)
                },
                {
                    stop,
                    departure: time(2),
                    plannedDeparture: time(0),
                    departureDelay: 120,
                    platform: '1'
                },
                {
                    stop: { id: '900100024', name: 'Schillingstraße' },
                    arrival: time(4),
                    plannedArrival: time(2),
                    arrivalDelay: 120,
                    platform: '2'
                }
            ]
        },
        longTrip: {
            id: 'mock-u5',
            line: u5,
            direction: 'HÃ¶now',
            stopovers: Array.from({ length: 32 }, (_, index) => ({
                stop: index === 20 ? stop : {
                    id: `long-route-${index}`,
                    name: `Route station ${index + 1}${index === 21 ? ' with a longer name across multiple lines' : ''}`
                },
                departure: time((index - 20) * 3 + 2),
                plannedDeparture: time((index - 20) * 3),
                departureDelay: 120,
                departurePlatform: '2'
            }))
        },
        movements: [
            {
                tripId: 'mock-u5',
                line: u5,
                direction: 'Hönow',
                location: { latitude: 52.522, longitude: 13.415 },
                speed: 24,
                nextStopovers: [
                    {
                        stop,
                        arrival: time(2),
                        plannedArrival: time(0),
                        arrivalDelay: 120
                    }
                ]
            },
            {
                tripId: 'unrelated-trip',
                line: s3,
                location: { latitude: 52.523, longitude: 13.41 }
            }
        ]
    };
}

async function mockApi(page) {
    const fixtures = createFixtures();
    const requests = [];
    const failures = { journeys: false, departures: false };
    const variants = { longTrip: false, journeys: null, departures: null, locations: null, nearby: null, locationDelay: 0 };

    await page.route('https://v6.bvg.transport.rest/**', async (route) => {
        const url = new URL(route.request().url());
        requests.push(url);
        const respond = (data, status = 200) =>
            route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(data)
            });

        if (url.pathname === '/locations/nearby') {
            return respond(variants.nearby || [
                { ...stop, distance: 120 },
                { ...destination, distance: 420 }
            ]);
        }
        if (url.pathname === '/locations') {
            if (variants.locations) {
                const data = variants.locations;
                if (variants.locationDelay)
                    await new Promise((resolve) => setTimeout(resolve, variants.locationDelay));
                return respond(data);
            }
            const query = (url.searchParams.get('query') || '').toLowerCase();
            if (query.includes('zoo')) return respond([destination]);
            if (query.includes('alex')) return respond([stop]);
            return respond([]);
        }
        if (/\/stops\/[^/]+\/departures$/.test(url.pathname)) {
            return failures.departures
                ? respond({ error: 'Fixture API unavailable' }, 503)
                : respond({ departures: variants.departures || fixtures.departures });
        }
        if (url.pathname === '/journeys') {
            return failures.journeys
                ? respond({ error: 'Fixture API unavailable' }, 503)
                : respond({ journeys: fixtures.journeyVariants[variants.journeys] || fixtures.journeys });
        }
        if (url.pathname.startsWith('/trips/')) {
            return respond({ trip: variants.longTrip ? fixtures.longTrip : fixtures.trip });
        }
        if (url.pathname === '/radar') return respond({ movements: fixtures.movements });
        throw new Error(`Unmocked API route: ${url.href}`);
    });

    return { requests, failures, variants };
}

async function visible(locator) {
    for (const candidate of await locator.all()) {
        if (await candidate.isVisible()) return candidate;
    }
    throw new Error(`No visible element matched ${locator}`);
}

async function navigate(page, name) {
    await (await visible(page.getByRole('button', { name, exact: true }))).click();
}

async function chooseLocation(page, input, query, name) {
    await input.fill(query);
    await page.getByRole('option', { name: `${name} Station`, exact: true }).getByRole('button').click();
    await expect(input).toHaveValue(name);
}

async function assertNoOverflow(page, label) {
    const dimensions = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth
    }));
    if (dimensions.scroll > dimensions.viewport + 1) {
        console.error(
            await page.evaluate(() =>
                [...document.querySelectorAll('body *')]
                    .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
                    .slice(0, 8)
                    .map((element) => ({
                        tag: element.tagName,
                        class: element.getAttribute('class'),
                        width: element.getBoundingClientRect().width,
                        right: element.getBoundingClientRect().right
                    }))
            )
        );
        await screenshot(page, `overflow-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
    }
    assert.ok(
        dimensions.scroll <= dimensions.viewport + 1,
        `${label}: horizontal overflow (${dimensions.scroll}px > ${dimensions.viewport}px)`
    );
}

async function assertJourneyControlsAlignment(page) {
    await expect(page.getByRole('combobox', { name: /^from$/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /^to$/i })).toBeVisible();
    const geometry = await page.evaluate(() => {
        const origin = document.getElementById('journey-origin').parentElement;
        const destination = document.getElementById('journey-destination').parentElement;
        const swap = document.querySelector('[aria-label="Swap origin and destination"]');
        const centerY = (element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.y + bounds.height / 2;
        };
        return {
            expectedSwapCenter: (centerY(origin) + centerY(destination)) / 2,
            swapCenter: centerY(swap),
            originMarker: origin.querySelector('[aria-hidden]').getBoundingClientRect().x,
            destinationMarker: destination.querySelector('[aria-hidden]').getBoundingClientRect().x
        };
    });
    assert.ok(Math.abs(geometry.swapCenter - geometry.expectedSwapCenter) <= 1);
    assert.equal(geometry.originMarker, geometry.destinationMarker);
}

async function assertJourneyRailContrast(details, label) {
    const colors = await details.locator('[data-journey-step="ride"] [data-journey-leg]').evaluateAll((legs) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        const rgb = (color) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return legs.map((leg) => ({
            rail: rgb(getComputedStyle(leg.querySelector('[aria-hidden="true"] > span')).backgroundColor),
            surface: rgb(getComputedStyle(leg.closest('article')).backgroundColor)
        }));
    });
    const luminance = (rgb) => rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const ratios = colors.map(({ rail, surface }) => {
        const values = [luminance(rail), luminance(surface)].sort((first, second) => second - first);
        return (values[0] + 0.05) / (values[1] + 0.05);
    });
    assert.ok(ratios.length > 0, 'Rail contrast requires an expanded ride.');
    assert.ok(ratios.every((ratio) => ratio >= 3), `${label}: route rails require 3:1 contrast (${ratios.map((ratio) => ratio.toFixed(2)).join(', ')}).`);
    return ratios;
}

async function assertTripTimelineGeometry(dialog) {
    const stops = await dialog.locator('ol > li').evaluateAll((rows) => rows.map((row) => {
        const bounds = (element) => {
            if (!element) return null;
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
        };
        const marker = row.querySelector('[data-stop-marker]');
        return {
            row: bounds(row),
            marker: bounds(marker),
            dot: bounds(marker?.firstElementChild),
            before: bounds(row.querySelector('[data-stop-connector="before"]')),
            after: bounds(row.querySelector('[data-stop-connector="after"]'))
        };
    }));
    const closeTo = (actual, expected, label) => assert.ok(
        Math.abs(actual - expected) <= 1,
        `${label}: expected ${expected}px, received ${actual}px.`
    );
    assert.ok(stops.length > 1, 'The route fixture must include multiple stops.');
    assert.equal(stops[0].before, null, 'The route must start at its first dot.');
    assert.equal(stops.at(-1).after, null, 'The route must end at its last dot.');
    for (const [index, stop] of stops.entries()) {
        assert.ok(stop.marker && stop.dot, `Stop ${index + 1} needs a visible marker.`);
        closeTo(stop.dot.centerX, stop.marker.centerX, `Stop ${index + 1} dot horizontal center`);
        closeTo(stop.dot.centerY, stop.marker.centerY, `Stop ${index + 1} dot vertical center`);
        closeTo(stop.marker.centerX, stops[0].marker.centerX, `Stop ${index + 1} route alignment`);
        if (index > 0) {
            assert.ok(stop.before, `Stop ${index + 1} needs an incoming connector.`);
            closeTo(stop.before.centerX, stop.marker.centerX, `Stop ${index + 1} incoming alignment`);
            closeTo(stop.before.y + stop.before.height, stop.marker.centerY, `Stop ${index + 1} incoming endpoint`);
            closeTo(stop.before.y, stops[index - 1].after.y + stops[index - 1].after.height, `Stops ${index}–${index + 1} connection`);
        }
        if (index < stops.length - 1) {
            assert.ok(stop.after, `Stop ${index + 1} needs an outgoing connector.`);
            closeTo(stop.after.centerX, stop.marker.centerX, `Stop ${index + 1} outgoing alignment`);
            closeTo(stop.after.y, stop.marker.centerY, `Stop ${index + 1} outgoing endpoint`);
        }
    }
    return stops;
}

async function assertTripDialogViewport(dialog) {
    const close = dialog.getByRole('button', { name: 'Close line overview', exact: true });
    for (const element of [dialog, dialog.getByRole('heading', { name: 'Line overview', exact: true }), close]) {
        await expect(element).toBeInViewport({ ratio: 1 });
    }
    assert.equal(await close.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    }), true, 'The line overview close button must remain hittable.');
    const geometry = await dialog.evaluate((element) => {
        const bounds = (node) => {
            const box = node.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom };
        };
        const scroller = element.querySelector('ol').parentElement;
        return {
            header: bounds(element.firstElementChild),
            current: bounds(element.querySelector('[data-current-stop]')),
            scroller: { ...bounds(scroller), scrollTop: scroller.scrollTop }
        };
    });
    assert.ok(geometry.scroller.top >= geometry.header.bottom - 1, 'The stop list must sit below its header.');
    assert.ok(
        geometry.current.top >= geometry.scroller.top - 1 && geometry.current.bottom <= geometry.scroller.bottom + 1,
        'Opening a long route must scroll the selected stop fully into view.'
    );
    return geometry;
}

async function screenshot(page, filename, fullPage = true) {
    await expect(page.locator('.switch-enter-active, .switch-leave-active')).toHaveCount(0);
    await page.screenshot({
        path: fileURLToPath(new URL(filename, screenshotDirectory)),
        fullPage
    });
}

async function checkLocationSearch() {
    console.log('All searches show only stations, deduplicate records and handle keyboard navigation');
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
        geolocation: { latitude: 52.5215, longitude: 13.4113 }, permissions: ['geolocation']
    });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const api = await mockApi(page);
    const place = { type: 'location', poi: true, id: 'place', name: stop.name, latitude: 52.5215, longitude: 13.4113 };
    api.variants.locations = [
        stop, { ...stop },
        { ...stop, location: { latitude: 52.52151, longitude: 13.4113 } },
        place, { ...place, id: 'second-place-pin', latitude: 52.5225 },
        { ...place, id: null, poi: false }, destination, null, {}
    ];
    await page.addInitScript(({ stop, place }) => {
        localStorage.setItem('journeyOrigin', JSON.stringify(place));
        localStorage.setItem('journeyDestination', JSON.stringify({ ...place, poi: false }));
        const { type, ...legacyStop } = stop;
        localStorage.setItem('selectedStop', JSON.stringify(legacyStop));
    }, { stop, place });
    await page.goto(baseUrl);
    const origin = page.getByRole('combobox', { name: 'From', exact: true });
    const to = page.getByRole('combobox', { name: 'To', exact: true });
    const options = page.getByRole('listbox').getByRole('option');
    await expect(origin).toHaveValue('');
    await expect(to).toHaveValue('');
    await to.fill('Destination');
    await expect(options).toHaveCount(2);
    const destinationRequest = api.requests.filter((url) => url.pathname === '/locations').at(-1);
    assert.equal(destinationRequest.searchParams.get('addresses'), 'false');
    assert.equal(destinationRequest.searchParams.get('poi'), 'false');
    await options.last().getByRole('button').click();
    await origin.fill('Alexander');
    await expect(page.getByRole('listbox', { name: 'From suggestions' }).getByRole('option')).toHaveCount(2);
    await expect(page.getByRole('option', { name: `${stop.name} Station`, exact: true })).toBeVisible();
    const originRequest = api.requests.filter((url) => url.pathname === '/locations').at(-1);
    assert.equal(originRequest.searchParams.get('results'), '20');
    assert.equal(originRequest.searchParams.get('addresses'), 'false');
    assert.equal(originRequest.searchParams.get('poi'), 'false');
    for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await assertNoOverflow(page, `${width}px station suggestions`);
        await screenshot(page, `station-search-${width}.png`, false);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('option', { name: `${stop.name} Station`, exact: true }).getByRole('button').click();
    await expect(origin).toHaveValue(stop.name);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('journeyOrigin')).id), stop.id);

    console.log('Station fields clear on focus and restore unchanged selections without clearing saved endpoints');
    const plannerHeading = page.getByRole('heading', { name: 'Plan a journey', exact: true });
    const searchCountBeforeFocus = api.requests.filter((url) => url.pathname === '/locations').length;
    for (const [field, station, storageKey] of [
        [origin, stop, 'journeyOrigin'], [to, destination, 'journeyDestination']
    ]) {
        await field.click();
        await expect(field).toHaveValue('');
        assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).id, storageKey), station.id);
        await plannerHeading.click();
        await expect(field).toHaveValue(station.name);
    }
    assert.equal(api.requests.filter((url) => url.pathname === '/locations').length, searchCountBeforeFocus);

    await origin.focus();
    await expect(origin).toHaveValue('');
    await origin.press('Tab');
    await page.keyboard.press('Tab');
    await expect(origin).toHaveValue(stop.name);
    await expect(to).toBeFocused();
    await expect(to).toHaveValue('');
    await to.press('Tab');
    await expect(to).toHaveValue(destination.name);

    await origin.click();
    await origin.press('Escape');
    await expect(origin).toHaveValue(stop.name);
    await origin.click();
    await expect(origin).toHaveValue('');
    await plannerHeading.click();
    await expect(origin).toHaveValue(stop.name);

    await origin.click();
    const unchangedJourneyRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/journeys');
    await origin.press('Enter');
    const unchangedJourney = new URL((await unchangedJourneyRequest).url());
    assert.equal(unchangedJourney.searchParams.get('from'), stop.id);
    assert.equal(unchangedJourney.searchParams.get('to'), destination.id);
    await expect(origin).toHaveValue(stop.name);

    await origin.click();
    await origin.pressSequentially('Zoo');
    await expect(origin).toHaveValue('Zoo');
    await plannerHeading.click();
    await expect(origin).toHaveValue('Zoo');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('journeyOrigin'))), null);
    await origin.click();
    await expect(origin).toHaveValue('');
    await plannerHeading.click();
    await expect(origin).toHaveValue('Zoo');
    await origin.click();
    await origin.pressSequentially('Zoo');
    await page.getByRole('listbox', { name: 'From suggestions' })
        .getByRole('option', { name: `${destination.name} Station`, exact: true }).getByRole('button').click();
    await expect(origin).toHaveValue(destination.name);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('journeyOrigin')).id), destination.id);
    await origin.click();
    await plannerHeading.click();
    await expect(origin).toHaveValue(destination.name);
    await chooseLocation(page, origin, 'Alexander', stop.name);
    await origin.click();
    await navigate(page, 'Departures');
    await navigate(page, 'Journeys');
    await expect(origin).toHaveValue(stop.name);

    await origin.fill('A');
    await expect(options).toHaveCount(0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('journeyOrigin'))), null);

    api.variants.locations = Array.from({ length: 10 }, (_, index) => ({
        ...stop, id: `keyboard-${index}`, name: `Station ${index + 1}`
    }));
    await origin.fill('Stations');
    await expect(options).toHaveCount(8);
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await origin.press('ArrowUp');
    await expect(origin).toHaveAttribute('aria-activedescendant', 'journey-origin-option-7');
    const geometry = await options.last().evaluate((option) => {
        const bounds = option.getBoundingClientRect();
        const scroller = option.parentElement.parentElement.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, min: scroller.top, max: scroller.bottom };
    });
    assert.ok(geometry.top >= geometry.min - 1 && geometry.bottom <= geometry.max + 1);
    assert.equal(await page.evaluate(() => window.scrollY), beforeScroll, 'Arrow keys should scroll only suggestions.');
    await origin.press('ArrowDown');
    await expect(origin).toHaveAttribute('aria-activedescendant', 'journey-origin-option-0');
    await origin.press('Escape');
    await expect(origin).toHaveAttribute('aria-expanded', 'false');
    await expect(origin).not.toHaveAttribute('aria-activedescendant');
    await origin.press('ArrowUp');
    await expect(origin).not.toHaveAttribute('aria-activedescendant');
    await origin.fill('Stations again');
    await expect(options).toHaveCount(8);
    await origin.press('ArrowUp');
    await origin.press('Enter');
    await expect(origin).toHaveValue('Station 8');

    await origin.fill('Origin search');
    await expect(origin).toHaveAttribute('aria-expanded', 'true');
    await to.fill('Destination search');
    await expect(to).toHaveAttribute('aria-expanded', 'true');
    await expect(origin).toHaveAttribute('aria-expanded', 'false');
    await navigate(page, 'Departures');
    await navigate(page, 'Journeys');
    await expect(options).toHaveCount(0);

    api.variants.nearby = [{ ...stop, distance: 120 }, { ...stop, distance: 125 }, place, { ...destination, distance: 420 }];
    await page.getByRole('button', { name: 'Use my location for from' }).click();
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText('120 m');
    await options.first().getByRole('button').click();
    await expect(origin).toHaveValue(stop.name);

    await origin.focus();
    await origin.press('Tab');
    const nearbyButton = page.getByRole('button', { name: 'Use my location for from' });
    await expect(nearbyButton).toBeFocused();
    await nearbyButton.press('Enter');
    await expect(origin).toBeFocused();
    await expect(options).toHaveCount(2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(options).toHaveCount(2);

    console.log('Older search requests cannot replace a newer query or reopen a dismissed dropdown');
    api.variants.locations = [stop];
    api.variants.locationDelay = 700;
    const oldRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get('query') === 'Older');
    await origin.fill('Older');
    await oldRequest;
    api.variants.locations = [destination];
    api.variants.locationDelay = 0;
    await origin.fill('Newer');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(destination.name);
    await new Promise((resolve) => setTimeout(resolve, 750));
    await expect(options.first()).toContainText(destination.name);
    api.variants.locationDelay = 700;
    const dismissed = page.waitForRequest((request) => new URL(request.url()).searchParams.get('query') === 'Dismissed');
    await origin.fill('Dismissed');
    await dismissed;
    await origin.press('Enter');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await origin.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 750));
    await expect(origin).toHaveAttribute('aria-expanded', 'false');
    await expect(options).toHaveCount(0);

    api.variants.locations = [];
    api.variants.locationDelay = 0;
    await origin.fill('Nothing found');
    await expect(page.getByText('No stations found. Try another name.', { exact: true })).toBeVisible();
    await origin.press('Enter');
    await expect(page.getByRole('alert')).toHaveCount(0);

    api.variants.locationDelay = 0;
    api.variants.locations = [place, stop, { ...stop }];
    await navigate(page, 'Departures');
    const stopInput = page.getByRole('combobox', { name: /stop|station/i });
    await expect(stopInput).toHaveValue(stop.name);
    await stopInput.click();
    await expect(stopInput).toHaveValue('');
    await page.getByRole('heading', { name: 'Find your stop', exact: true }).click();
    await expect(stopInput).toHaveValue(stop.name);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('selectedStop')).id), stop.id);
    await stopInput.fill('Alexander');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Station');
    const searchRequest = api.requests.filter((url) => url.pathname === '/locations').at(-1);
    assert.equal(searchRequest.searchParams.get('addresses'), 'false');
    assert.equal(searchRequest.searchParams.get('poi'), 'false');
    assert.deepEqual(errors, []);
    await context.close();
}

async function checkDepartureBadges() {
    console.log('Departure columns accommodate longer ICE and regional badges without overlap');
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    activePage = page;
    const api = await mockApi(page);
    api.variants.departures = ['U5', 'ICE 646', 'ICE 1007', 'RE 3138'].map((name, index) => ({
        tripId: `badge-${index}`, stop, line: { name, product: name.startsWith('ICE') ? 'express' : 'regional' },
        direction: 'Essen, Hauptbahnhof', when: new Date(Date.now() + 120000).toISOString(),
        plannedWhen: new Date(Date.now() + 60000).toISOString(), delay: 60, platform: '7'
    }));
    await page.addInitScript((stop) => {
        localStorage.setItem('selectedStop', JSON.stringify(stop));
        localStorage.setItem('currentView', 'departures');
    }, stop);
    await page.goto(baseUrl);
    const table = page.getByRole('table', { name: 'Departures', exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(4);
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') {
            await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
            await expect(page.locator('body')).toHaveCSS('color', 'rgb(244, 244, 240)');
        }
        for (const width of [1440, 1024, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            await assertNoOverflow(page, `${width}px ${theme} long departure badges`);
            const rows = await table.locator('tbody tr').evaluateAll((rows) => rows.map((row) => {
                const badge = row.cells[0].firstElementChild.getBoundingClientRect();
                const lineCell = row.cells[0].getBoundingClientRect();
                const destination = row.cells[1].firstElementChild;
                const text = destination.firstChild;
                const word = document.createRange();
                const start = text.textContent.indexOf('Hauptbahnhof');
                word.setStart(text, start);
                word.setEnd(text, start + 'Hauptbahnhof'.length);
                return {
                    line: row.cells[0].textContent.trim(), gap: destination.getBoundingClientRect().left - badge.right,
                    contained: badge.right <= lineCell.right + 0.5,
                    wrapped: destination.scrollWidth <= destination.clientWidth,
                    wordLines: word.getClientRects().length
                };
            }));
            for (const row of rows) {
                assert.ok(row.gap >= 11.5, `${row.line} needs a 12px gap before its destination at ${width}px.`);
                assert.ok(row.contained, `${row.line} must fit its column.`);
                assert.ok(row.wrapped, 'Destination text must wrap within the available space.');
                assert.equal(row.wordLines, 1, `${row.line}: Hauptbahnhof should wrap as a whole word at ${width}px.`);
            }
            if ([1440, 320].includes(width))
                await table.screenshot({ path: fileURLToPath(new URL(`departure-badges-${theme}-${width}.png`, screenshotDirectory)) });
        }
    }
    await context.close();
}

async function checkAppInstallation() {
    console.log('App manifest, manual installation, deferred prompt and installed states');
    const errors = [];
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
    const open = async (mode = 'desktop') => {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'light',
            ...(mode.startsWith('ios') ? { userAgent: iphone, hasTouch: true } : {})
        });
        const page = await context.newPage();
        activePage = page;
        page.on('pageerror', (error) => errors.push(error.message));
        await mockApi(page);
        await page.addInitScript((mode) => {
            localStorage.setItem('theme', 'light');
            // Keep tests deterministic and never invoke a real browser installer.
            window.addEventListener('beforeinstallprompt', (event) => {
                if (event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); }
            }, true);
            if (mode === 'ios-installed') Object.defineProperty(navigator, 'standalone', { value: true });
            if (mode === 'standalone') {
                const matchMedia = window.matchMedia.bind(window);
                window.matchMedia = (query) => {
                    const result = matchMedia(query);
                    if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true });
                    return result;
                };
            }
        }, mode);
        await page.goto(baseUrl);
        await expect(page.getByRole('heading', { name: 'Plan a journey', exact: true })).toBeVisible();
        return { context, page };
    };
    const { context, page } = await open();
    const manifestUrl = await page.locator('link[rel="manifest"]').evaluate((link) => link.href);
    const response = await page.request.get(manifestUrl);
    assert.ok(response.ok(), 'The manifest must be served successfully.');
    const manifest = await response.json();
    assert.equal(manifest.name, 'BVG Dashboard');
    assert.equal(manifest.id, './');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, undefined, 'Installation must allow portrait and landscape.');
    assert.deepEqual(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose]), [
        ['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']
    ]);
    const appleUrl = await page.locator('link[rel="apple-touch-icon"]').evaluate((link) => link.href);
    for (const icon of [...manifest.icons, { src: appleUrl, sizes: '180x180' }]) {
        const asset = await page.request.get(new URL(icon.src, manifestUrl).href);
        assert.ok(asset.ok(), `App icon must be served: ${icon.src}`);
        assert.match(asset.headers()['content-type'], /image\/png/);
        const png = await asset.body();
        assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    }
    await navigate(page, 'Settings');
    const manual = page.getByRole('button', { name: 'Installation instructions', exact: true });
    await manual.click();
    await expect(page.getByRole('heading', { name: 'From your browser', exact: true })).toBeVisible();
    await expect(page.getByText('Live departures, journey planning and maps need an internet connection.')).toBeVisible();
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByRole('switch', { name: /dark mode/i }).locator('..').click();
        assert.equal(await page.locator('html').evaluate((html) => html.classList.contains('dark')), theme === 'dark');
        for (const width of [320, 390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await assertNoOverflow(page, `${width}px ${theme} installation instructions`);
        }
    }
    await context.close();

    const deferred = await open();
    await deferred.page.evaluate(() => {
        window.installPromptCalls = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.installPromptCalls++; return { outcome: 'dismissed' }; };
        window.installPromptPrevented = !window.dispatchEvent(event);
    });
    assert.equal(await deferred.page.evaluate(() => window.installPromptPrevented), true);
    await navigate(deferred.page, 'Settings');
    await deferred.page.getByRole('button', { name: 'Install app', exact: true }).click();
    const fallback = deferred.page.getByRole('button', { name: 'Installation instructions', exact: true });
    await expect(fallback).toBeVisible();
    await fallback.click();
    await expect(deferred.page.getByRole('heading', { name: 'From your browser', exact: true })).toBeVisible();
    assert.equal(await deferred.page.evaluate(() => window.installPromptCalls), 1);
    await deferred.page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(deferred.page.getByRole('status').filter({ hasText: 'App installed.' })).toBeVisible();
    await expect(fallback).toHaveCount(0);
    await expect(deferred.page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
    await deferred.context.close();

    for (const mode of ['ios', 'ios-installed', 'standalone']) {
        const current = await open(mode);
        await navigate(current.page, 'Settings');
        const add = current.page.getByRole('button', { name: 'Add to Home Screen', exact: true });
        if (mode === 'ios') {
            await add.click();
            await expect(current.page.getByRole('heading', { name: 'On iPhone or iPad', exact: true })).toBeVisible();
            await expect(current.page.getByText('Open this website in Safari.', { exact: true })).toBeVisible();
            await expect(current.page.locator('#app-install-instructions')).toContainText('Share menu');
        } else {
            await expect(current.page.getByRole('status').filter({ hasText: 'App installed.' })).toBeVisible();
            await expect(add).toHaveCount(0);
            await expect(current.page.getByRole('button', { name: /^(Install app|Installation instructions)$/ })).toHaveCount(0);
        }
        await current.context.close();
    }
    assert.deepEqual(errors, [], 'Installation settings must not produce runtime errors.');
}

try {
    await checkAppInstallation();
    await checkDepartureBadges();
    await checkLocationSearch();
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: 'en-US',
        timezoneId: 'Europe/Berlin',
        colorScheme: 'light',
        reducedMotion: 'reduce',
        geolocation: { latitude: 52.5215, longitude: 13.4113 },
        permissions: ['geolocation']
    });
    const page = await context.newPage();
    activePage = page;
    await page.clock.install({ time: new Date() });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const api = await mockApi(page);

    await page.goto(baseUrl);
    const originInput = page.getByRole('combobox', { name: /^from$/i });
    const destinationInput = page.getByRole('combobox', { name: /^to$/i });
    await expect(originInput).toBeVisible();
    await assertNoOverflow(page, 'Desktop initial view');
    await assertJourneyControlsAlignment(page);

    console.log('German dates and 24-hour editing are independent of the browser locale');
    const dateInput = page.getByRole('textbox', {
        name: 'Journey date',
        exact: true
    });
    const timeInput = page.getByRole('textbox', {
        name: 'Journey time',
        exact: true
    });
    await expect(dateInput).toHaveValue(/^\d{2}\.\d{2}\.\d{4}$/);
    await expect(timeInput).toHaveValue(/^([01]\d|2[0-3]):[0-5]\d$/);
    await expect(page.getByText(/^(Mo|Di|Mi|Do|Fr|Sa|So)\., \d{2}\.\d{2}\.\d{4}$/)).toBeVisible();
    await dateInput.fill('31.02.2026');
    assert.equal(await dateInput.evaluate((element) => element.checkValidity()), false);
    await timeInput.fill('24:30');
    assert.equal(await timeInput.evaluate((element) => element.checkValidity()), false);
    await page.getByRole('button', { name: 'Now', exact: true }).click();
    assert.equal(await dateInput.evaluate((element) => element.checkValidity()), true);
    assert.equal(await timeInput.evaluate((element) => element.checkValidity()), true);
    await page.getByRole('button', { name: 'Choose journey date', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.locator('input[type="date"]').evaluate((element) => {
        element.value = '2026-10-30';
        element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(dateInput).toHaveValue('30.10.2026');

    console.log('Time field and Tabler clock open an accessible 24-hour picker');
    const timePicker = page.getByRole('dialog', { name: '24-hour time', exact: true });
    await timeInput.click();
    await expect(timePicker).toBeVisible();
    await timePicker.getByRole('combobox', { name: 'Hours', exact: true }).selectOption('23');
    await timePicker.getByRole('combobox', { name: 'Minutes', exact: true }).selectOption('05');
    await screenshot(page, 'desktop-time-picker.png');
    await timePicker.getByRole('button', { name: 'Set time', exact: true }).click();
    await expect(timePicker).not.toBeVisible();
    await expect(timeInput).toHaveValue('23:05');
    await expect(timeInput).toBeFocused();
    await page.getByRole('button', { name: 'Choose journey time', exact: true }).click();
    await expect(timePicker.getByRole('combobox', { name: 'Hours', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(timePicker).not.toBeVisible();
    await timeInput.press('ArrowDown');
    await expect(timePicker).toBeVisible();
    await timePicker.getByRole('combobox', { name: 'Minutes', exact: true }).press('Enter');
    await expect(timePicker).not.toBeVisible();
    await timeInput.click();
    await timeInput.fill('22:45');
    await timePicker.getByRole('button', { name: 'Set time', exact: true }).click();
    await expect(timeInput).toHaveValue('22:45');
    await timeInput.fill('23:05');

    console.log('Nearby stops use granted geolocation and show distances');
    await page.getByRole('button', { name: 'Use my location for from' }).click();
    const nearbyOption = page.getByRole('option').filter({ hasText: stop.name });
    await expect(nearbyOption).toContainText('120 m');
    await nearbyOption.getByRole('button').click();
    await expect(originInput).toHaveValue(stop.name);
    const nearbyRequest = api.requests.find((url) => url.pathname === '/locations/nearby');
    assert.equal(nearbyRequest.searchParams.get('latitude'), '52.5215');
    assert.equal(nearbyRequest.searchParams.get('longitude'), '13.4113');

    console.log('Journey search, keyboard selection, route details, and accordion');
    await originInput.fill('Alexander');
    await expect(page.getByRole('option', { name: stop.name })).toBeVisible();
    await originInput.press('ArrowDown');
    await originInput.press('Enter');
    await expect(originInput).toHaveValue(stop.name);
    await chooseLocation(page, destinationInput, 'Zoo', destination.name);
    const swapButton = page.getByRole('button', {
        name: 'Swap origin and destination',
        exact: true
    });
    await swapButton.click();
    await expect(originInput).toHaveValue(destination.name);
    await expect(destinationInput).toHaveValue(stop.name);
    await swapButton.click();
    const searchButton = page.getByRole('button', {
        name: /find journeys|search journeys/i
    });
    await page.evaluate(() => {
        window.journeyScrolls = [];
        const scrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (options) {
            if (this.querySelector('article')) window.journeyScrolls.push(options);
            return scrollIntoView.call(this, options);
        };
    });
    const desktopScrollBeforeSearch = await page.evaluate(() => window.scrollY);
    await searchButton.click();
    const firstJourney = page.getByRole('button', {
        name: /^View journey 1 details/i
    });
    const secondJourney = page.getByRole('button', {
        name: /^View journey 2 details/i
    });
    await expect(firstJourney).toBeVisible();
    await expect(secondJourney).toBeVisible();
    assert.equal(await page.evaluate(() => window.scrollY), desktopScrollBeforeSearch);
    assert.deepEqual(
        await page.evaluate(() => window.journeyScrolls),
        [],
        'Already-visible desktop results must not move the page.'
    );
    const journeyRequest = api.requests.find((url) => url.pathname === '/journeys');
    assert.equal(journeyRequest.searchParams.get('from'), stop.id);
    assert.equal(journeyRequest.searchParams.get('to'), destination.id);
    assert.equal(journeyRequest.searchParams.get('results'), '5');
    assert.ok(journeyRequest.searchParams.has('departure'));
    assert.equal(journeyRequest.searchParams.get('departure'), '2026-10-30T22:05:00.000Z');
    assert.doesNotMatch(await firstJourney.textContent(), /\b(?:AM|PM)\b/i);
    await firstJourney.click();
    await expect(firstJourney).toHaveAttribute('aria-expanded', 'true');
    const journeyDetails = page.getByRole('region', { name: 'Journey 1 details', exact: true });
    const transfer = journeyDetails.locator('[data-journey-transfer]');
    const journeyLegs = journeyDetails.locator('[data-journey-leg]');
    await expect(transfer).toContainText(/5 min\s*to transfer/);
    await expect(transfer.getByText('Walk 3 min', { exact: true })).toBeVisible();
    await expect(transfer.getByText('Wait 2 min', { exact: true })).toBeVisible();
    await expect(transfer).toContainText('180 m');
    await expect(transfer.getByText('U5', { exact: true })).toBeVisible();
    await expect(transfer.getByText('S3', { exact: true })).toBeVisible();
    await expect(transfer.getByText('Platform 2', { exact: true })).toBeVisible();
    await expect(transfer.getByText('Platform 1', { exact: true })).toBeVisible();
    await expect(journeyLegs).toHaveCount(2);
    await expect(journeyLegs.first().locator('[data-journey-origin]')).toContainText('Board here');
    await expect(journeyLegs.first().locator('[data-journey-origin]')).toContainText('Platform 1');
    await expect(journeyLegs.first().locator('[data-journey-origin]')).toContainText('was 4');
    await expect(journeyLegs.first().locator('[data-journey-destination]')).toContainText('Get off here');
    await expect(journeyLegs.first().locator('[data-journey-destination]')).toContainText('Platform 2');
    await expect(journeyLegs.first().getByText('2 stops', { exact: true })).toBeVisible();
    await expect(journeyLegs.first().getByText('2 min departure delay', { exact: true })).toBeVisible();
    await expect(journeyLegs.first().locator('s')).toHaveCount(1);
    const intermediateStops = journeyDetails.getByRole('list', { name: 'Intermediate stops', exact: true });
    await expect(intermediateStops).not.toBeVisible();
    await journeyDetails.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(intermediateStops).toBeVisible();
    await expect(intermediateStops.getByText('Museumsinsel', { exact: true })).toBeVisible();
    await journeyDetails.locator('summary').press('Enter');
    await expect(intermediateStops).not.toBeVisible();
    await secondJourney.click();
    await expect(secondJourney).toHaveAttribute('aria-expanded', 'true');
    await expect(firstJourney).toHaveAttribute('aria-expanded', 'false');
    await firstJourney.click();
    await screenshot(page, 'desktop-journeys.png');

    console.log('Expanded itineraries retain ride, platform, and transfer detail across responsive widths');
    for (const viewport of [
        { width: 1440, height: 1000, name: 'desktop' },
        { width: 768, height: 1000, name: 'tablet' },
        { width: 390, height: 844, name: 'mobile' },
        { width: 320, height: 740, name: 'small-mobile' }
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(journeyDetails).toBeVisible();
        await expect(transfer.getByText('Wait 2 min', { exact: true })).toBeVisible();
        await journeyDetails.locator('summary').evaluate((element) => { element.parentElement.open = true; });
        await expect(intermediateStops.getByText('Museumsinsel', { exact: true })).toBeVisible();
        await assertNoOverflow(page, `${viewport.name} expanded journey`);
        await assertJourneyRailContrast(journeyDetails, `${viewport.name} light journey`);
        if (viewport.width <= 390) {
            assert.ok(await journeyDetails.locator('summary').evaluate((element) => element.getBoundingClientRect().height) >= 44,
                'Intermediate-stop disclosures need a 44px mobile touch target.');
        }
        await page.evaluate(() => {
            document.activeElement?.blur();
            window.scrollTo(0, 0);
        });
        await screenshot(page, `${viewport.name}-journey-details.png`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    console.log('Journey API failure and recovery');
    api.failures.journeys = true;
    await searchButton.click();
    await expect(
        page.getByRole('alert').filter({ hasText: /503|unavailable|could not|failed/i })
    ).toBeVisible();
    await expect(firstJourney).toHaveCount(0);
    api.failures.journeys = false;
    await searchButton.click();
    await expect(firstJourney).toBeVisible();

    console.log('Direct transfers, access walks, missing details, cancellations, and missed connections stay honest');
    const showJourneyVariant = async (name) => {
        api.variants.journeys = name;
        await Promise.all([
            page.waitForResponse((response) => new URL(response.url()).pathname === '/journeys'),
            searchButton.click()
        ]);
        await expect(journeyDetails).toHaveCount(0);
        await expect(firstJourney).toBeVisible();
        await firstJourney.click();
        await expect(journeyDetails).toBeVisible();
    };
    await showJourneyVariant('samePlatform');
    await expect(transfer).toHaveCount(1);
    await expect(transfer).toContainText(/4 min\s*to transfer/);
    await expect(transfer.getByText('Wait 4 min', { exact: true })).toBeVisible();
    await expect(transfer.getByText('Platform 2', { exact: true })).toHaveCount(2);
    await expect(transfer.getByText(/^Walk/)).toHaveCount(0);

    await showJourneyVariant('differentPlatforms');
    await expect(transfer).toHaveCount(1);
    await expect(transfer.getByText('Platform 2', { exact: true })).toBeVisible();
    await expect(transfer.getByText('Platform 7', { exact: true })).toBeVisible();
    await expect(transfer.getByText(/^Walk/)).toHaveCount(0);

    await showJourneyVariant('accessWalks');
    await expect(transfer).toHaveCount(0);
    await expect(journeyDetails.locator('[data-journey-step="walk"]')).toHaveCount(2);
    await expect(journeyDetails.locator('[data-journey-step="ride"]')).toHaveCount(1);
    await expect(journeyDetails.getByText('Walk 2 min', { exact: true })).toBeVisible();
    await expect(journeyDetails.getByText('Walk 4 min', { exact: true })).toBeVisible();
    await expect(journeyDetails.getByText('120 m', { exact: true })).toBeVisible();
    await expect(journeyDetails.getByText('200 m', { exact: true })).toBeVisible();
    await expect(journeyDetails.getByText('6 min on foot', { exact: true })).toBeVisible();

    await showJourneyVariant('missingFields');
    await expect(transfer).toHaveCount(1);
    await expect(transfer.getByText('Walk 3 min', { exact: true })).toBeVisible();
    await expect(transfer.getByText('Wait 2 min', { exact: true })).toBeVisible();
    await expect(transfer.getByText(/180 m/)).toHaveCount(0);
    await expect(journeyDetails.getByText(/Platform/)).toHaveCount(0);
    await expect(journeyDetails.locator('summary')).toHaveCount(0);
    assert.doesNotMatch(await journeyDetails.textContent(), /NaN|undefined|null|Invalid Date|\b(?:AM|PM)\b/);
    await assertNoOverflow(page, 'Journey with missing details');

    await showJourneyVariant('missedConnection');
    await expect(transfer.getByText('Transfer time is too short. Check another journey.', { exact: true })).toBeVisible();
    await expect(transfer.getByText(/^Wait/)).toHaveCount(0);
    await expect(journeyLegs.first().locator('s')).toHaveCount(1);
    await screenshot(page, 'journey-missed-connection.png');

    await showJourneyVariant('cancelledConnection');
    await expect(journeyDetails.getByText('This section is cancelled.', { exact: true })).toBeVisible();
    await expect(firstJourney).toContainText('Connection cancelled');
    await showJourneyVariant(null);

    console.log('Departure stop selection, grace filtering, and cached duration tabs');
    await navigate(page, 'Departures');
    const stopInput = page.getByRole('combobox', { name: /stop|station/i });
    await chooseLocation(page, stopInput, 'Alexander', stop.name);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('Expired departure', { exact: true })).toHaveCount(0);
    const departureRequestCount = () =>
        api.requests.filter((url) => /\/departures$/.test(url.pathname)).length;
    const beforeTabs = departureRequestCount();
    assert.equal(
        api.requests.find((url) => /\/departures$/.test(url.pathname)).searchParams.get('duration'),
        '60'
    );
    for (const [minutes, count] of [
        [10, 1],
        [20, 2],
        [30, 2],
        [45, 3],
        [60, 3]
    ]) {
        await page
            .getByRole('button', {
                name: new RegExp(`^${minutes}(m| minutes)$`)
            })
            .click();
        await expect(rows).toHaveCount(count);
    }
    assert.equal(
        departureRequestCount(),
        beforeTabs,
        'Duration switches must use the cached 60-minute response.'
    );
    await expect(rows.first().locator('s, .line-through')).toHaveCount(1);

    console.log('Trip dialog route, selected stop, platform, and Escape');
    await rows.filter({ hasText: 'Hönow' }).click();
    const tripDialog = page.getByRole('dialog', { name: 'Line overview' });
    await expect(tripDialog).toBeVisible();
    await expect(tripDialog.getByText('Rotes Rathaus', { exact: true })).toBeVisible();
    await expect(tripDialog.getByText('Schillingstraße', { exact: true })).toBeVisible();
    await expect(tripDialog.getByText('Your selected stop', { exact: true })).toBeVisible();
    await expect(tripDialog.getByText('Platform 1', { exact: true })).toBeVisible();
    await assertTripTimelineGeometry(tripDialog);
    await page.keyboard.press('Escape');
    await expect(tripDialog).not.toBeVisible();

    console.log('Long trip timeline stays connected and selected stops remain reachable at every viewport');
    api.variants.longTrip = true;
    for (const viewport of [
        { width: 1440, height: 1000, name: 'desktop' },
        { width: 320, height: 740, name: 'small-mobile' },
        { width: 667, height: 375, name: 'landscape' }
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await rows.first().click();
        await expect(tripDialog.locator('ol > li')).toHaveCount(32);
        const geometry = await assertTripDialogViewport(tripDialog);
        assert.ok(geometry.scroller.scrollTop > 0, 'A late selected stop must scroll within the dialog.');
        const stops = await assertTripTimelineGeometry(tripDialog);
        if (viewport.width === 320) {
            assert.ok(stops[21].row.height > stops[22].row.height, 'The long stop name must wrap to exercise variable-height connectors.');
        }
        await assertNoOverflow(page, `${viewport.name} line overview`);
        await screenshot(page, `${viewport.name}-line-overview.png`, false);
        await tripDialog.locator('ol').evaluate((element) => {
            element.parentElement.scrollTop = element.parentElement.scrollHeight;
        });
        await expect(tripDialog.locator('ol > li').last()).toBeInViewport({ ratio: 1 });
        const lastStop = await tripDialog.evaluate((element) => {
            const scroller = element.querySelector('ol').parentElement.getBoundingClientRect();
            const last = element.querySelector('ol > li:last-child').getBoundingClientRect();
            return { bottom: last.bottom, visibleBottom: scroller.bottom, dialogScroll: element.scrollTop };
        });
        assert.ok(lastStop.bottom <= lastStop.visibleBottom + 1, 'The final stop must remain reachable inside the stop list.');
        assert.equal(lastStop.dialogScroll, 0, 'Scrolling the stop list must leave its header fixed.');
        await tripDialog.getByRole('button', { name: 'Close line overview', exact: true }).click();
        await expect(tripDialog).not.toBeVisible();
    }
    api.variants.longTrip = false;
    await page.setViewportSize({ width: 1440, height: 1000 });

    console.log('Departure API error leaves a visible retry state');
    api.failures.departures = true;
    await page.getByRole('button', { name: /refresh departures|refresh now/i }).click();
    await expect(
        page.getByRole('alert').filter({ hasText: /could not be updated|could not|503|failed/i })
    ).toBeVisible();
    api.failures.departures = false;
    await page.getByRole('button', { name: /refresh departures|refresh now/i }).click();
    await expect(rows).toHaveCount(3);

    console.log(
        'Lazy radar filters unrelated trips, keeps popup during refresh, and stops on close'
    );
    const radarRequestCount = () => api.requests.filter((url) => url.pathname === '/radar').length;
    assert.equal(radarRequestCount(), 0, 'Radar must load only after it is opened.');
    await page.getByRole('button', { name: 'Open live radar' }).click();
    const radarDialog = page.getByRole('dialog', { name: 'Live radar' });
    await expect(radarDialog).toBeVisible();
    await expect(
        radarDialog.getByText('1 vehicle serving this stop', { exact: true })
    ).toBeVisible();
    await expect(radarDialog.locator('.vehicle-marker')).toHaveCount(1);
    await radarDialog.locator('.vehicle-marker').click();
    await expect(radarDialog.getByText('Next stop', { exact: true })).toBeVisible();
    await expect(radarDialog.getByText('24 km/h', { exact: true })).toBeVisible();
    const beforeRadarRefresh = radarRequestCount();
    await page.clock.fastForward(11000);
    await expect.poll(radarRequestCount).toBeGreaterThan(beforeRadarRefresh);
    await expect(radarDialog.getByText('24 km/h', { exact: true })).toBeVisible();
    await radarDialog.getByRole('button', { name: 'Recenter on your stop' }).click();
    await screenshot(page, 'desktop-radar.png');

    console.log('Landscape radar keeps its controls, footer, and map attribution in view');
    await page.setViewportSize({ width: 667, height: 375 });
    const radarFooter = radarDialog.locator('footer');
    const attribution = radarDialog.locator('.leaflet-control-attribution');
    const closeRadar = radarDialog.getByRole('button', { name: 'Close radar' });
    for (const element of [radarFooter, attribution, closeRadar]) {
        await expect(element).toBeInViewport({ ratio: 1 });
    }
    await expect(radarDialog.locator('.stop-marker')).toBeInViewport({
        ratio: 1
    });
    const radarBounds = await radarDialog.boundingBox();
    for (const [name, element] of [
        ['footer', radarFooter],
        ['map attribution', attribution]
    ]) {
        const bounds = await element.boundingBox();
        assert.ok(
            bounds.x >= radarBounds.x - 1 &&
            bounds.y >= radarBounds.y - 1 &&
            bounds.x + bounds.width <= radarBounds.x + radarBounds.width + 1 &&
            bounds.y + bounds.height <= radarBounds.y + radarBounds.height + 1,
            `Landscape radar ${name} must fit inside the dialog.`
        );
    }
    await screenshot(page, 'landscape-radar.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.keyboard.press('Escape');
    await expect(radarDialog).not.toBeVisible();
    const afterRadarClose = radarRequestCount();
    await page.clock.fastForward(11000);
    assert.equal(
        radarRequestCount(),
        afterRadarClose,
        'Closing radar must stop its refresh timer.'
    );

    console.log('Mobile dock, 320px layout, and desktop navigation');
    const mobileNavigation = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNavigation).not.toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(mobileNavigation).toBeVisible();
    await assertNoOverflow(page, '375px departures');
    await screenshot(page, 'mobile-departures.png');
    await navigate(page, 'Journeys');
    await expect(originInput).toHaveValue(stop.name);
    await expect(destinationInput).toHaveValue(destination.name);
    await assertJourneyControlsAlignment(page);
    await screenshot(page, 'mobile-journeys.png');

    console.log('Mobile journey results scroll into view after a successful search');
    await page.evaluate(() => window.scrollTo(0, 0));
    const mobileDockTop = await mobileNavigation.evaluate(
        (element) => element.getBoundingClientRect().top
    );
    assert.ok(
        await firstJourney.evaluate(
            (element) => element.closest('article').getBoundingClientRect().bottom
        ) > mobileDockTop,
        'Mobile results begin below the visible area.'
    );
    await page.evaluate(() => { window.journeyScrolls = []; });
    const mobileScrollBeforeSearch = await page.evaluate(() => window.scrollY);
    await searchButton.click();
    await expect(firstJourney).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(mobileScrollBeforeSearch);
    await expect(firstJourney).toBeInViewport({ ratio: 1 });
    assert.ok(
        await firstJourney.evaluate(
            (element) => element.closest('article').getBoundingClientRect().bottom
        ) <= mobileDockTop - 16,
        'The first connection must be fully visible above the mobile dock.'
    );
    assert.deepEqual(await page.evaluate(() => window.journeyScrolls), [
        { behavior: 'instant', block: 'start' }
    ], 'Reduced-motion preferences must skip the scroll animation.');
    await page.screenshot({
        path: fileURLToPath(new URL('mobile-journeys-after-search.png', screenshotDirectory))
    });

    console.log('Failed journey searches stay in place; normal motion uses a smooth scroll');
    await page.evaluate(() => {
        window.scrollTo(0, 0);
        window.journeyScrolls = [];
    });
    api.failures.journeys = true;
    const failedSearchScroll = await page.evaluate(() => window.scrollY);
    await searchButton.click();
    await expect(
        page.getByRole('alert').filter({ hasText: /503|unavailable|could not|failed/i })
    ).toBeVisible();
    assert.equal(await page.evaluate(() => window.scrollY), failedSearchScroll);
    assert.deepEqual(await page.evaluate(() => window.journeyScrolls), []);
    api.failures.journeys = false;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await searchButton.click();
    await expect(firstJourney).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.journeyScrolls), [
        { behavior: 'smooth', block: 'start' }
    ]);
    await expect.poll(() => firstJourney.evaluate(
        (element) => element.closest('article').getBoundingClientRect().bottom
    )).toBeLessThanOrEqual(mobileDockTop - 16);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 320, height: 740 });
    await assertNoOverflow(page, '320px journeys');
    await assertJourneyControlsAlignment(page);
    await timeInput.click();
    await expect(timePicker).toBeVisible();
    await assertNoOverflow(page, '320px time picker');
    for (const control of [
        timePicker.getByRole('combobox', { name: 'Hours', exact: true }),
        timePicker.getByRole('combobox', { name: 'Minutes', exact: true }),
        timePicker.getByRole('button', { name: 'Set time', exact: true })
    ]) {
        await expect(control).toBeInViewport({ ratio: 1 });
        assert.equal(await control.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            return element.contains(target);
        }), true, 'Time picker controls must not be covered by the mobile dock.');
    }
    await screenshot(page, 'small-mobile-time-picker.png');
    await page.getByRole('heading', { name: 'Plan a journey', exact: true }).click();
    await expect(timePicker).not.toBeVisible();
    await screenshot(page, 'small-mobile-journeys.png');
    await navigate(page, 'Departures');
    await assertNoOverflow(page, '320px departures');
    await navigate(page, 'Settings');
    await assertNoOverflow(page, '320px settings');

    console.log('Theme and transit preferences persist after reload');
    const themeControl = page.getByRole('switch', { name: /dark mode/i });
    await themeControl.locator('..').click();
    await expect(themeControl).toBeChecked();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('switch', { name: /dark mode/i })).toBeChecked();
    const persisted = await page.evaluate(() => ({
        view: localStorage.getItem('currentView'),
        duration: localStorage.getItem('selectedDuration'),
        origin: JSON.parse(localStorage.getItem('journeyOrigin')),
        destination: JSON.parse(localStorage.getItem('journeyDestination')),
        stop: JSON.parse(localStorage.getItem('selectedStop')),
        theme: localStorage.getItem('theme')
    }));
    assert.equal(persisted.view, 'settings');
    assert.equal(persisted.duration, '60');
    assert.equal(persisted.origin.id, stop.id);
    assert.equal(persisted.destination.id, destination.id);
    assert.equal(persisted.stop.id, stop.id);
    assert.equal(persisted.theme, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await assertNoOverflow(page, 'Desktop dark settings');
    await expect(mobileNavigation).not.toBeVisible();
    await screenshot(page, 'desktop-settings-dark.png');
    await navigate(page, 'Journeys');
    await expect(originInput).toHaveValue(stop.name);
    await expect(destinationInput).toHaveValue(destination.name);
    await searchButton.click();
    await expect(firstJourney).toBeVisible();
    await firstJourney.click();
    await expect(journeyDetails).toBeVisible();
    for (const viewport of [
        { width: 1440, height: 1000, name: 'desktop' },
        { width: 390, height: 844, name: 'mobile' }
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(transfer.getByText('Wait 2 min', { exact: true })).toBeVisible();
        await assertNoOverflow(page, `${viewport.name} dark expanded journey`);
        const contrasts = await assertJourneyRailContrast(journeyDetails, `${viewport.name} dark journey`);
        if (viewport.width === 1440) console.log(`Dark route-rail contrast: ${contrasts.map((ratio) => ratio.toFixed(2)).join(':1, ')}:1`);
        await page.evaluate(() => {
            document.activeElement?.blur();
            window.scrollTo(0, 0);
        });
        await screenshot(page, `${viewport.name}-journey-details-dark.png`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigate(page, 'Departures');
    await expect(stopInput).toHaveValue(stop.name);
    await expect(rows).toHaveCount(3);
    api.variants.longTrip = true;
    await rows.first().click();
    await expect(tripDialog.locator('ol > li')).toHaveCount(32);
    await assertTripDialogViewport(tripDialog);
    await assertTripTimelineGeometry(tripDialog);
    await screenshot(page, 'desktop-line-overview-dark.png', false);
    await page.keyboard.press('Escape');
    await expect(tripDialog).not.toBeVisible();
    api.variants.longTrip = false;

    console.log('Tablet and ultrawide layouts retain navigation without horizontal overflow');
    for (const width of [768, 2560]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(mobileNavigation).not.toBeVisible();
        for (const view of ['Journeys', 'Departures', 'Settings']) {
            await navigate(page, view);
            await assertNoOverflow(page, `${width}px ${view.toLowerCase()}`);
            if (width === 768 && view === 'Journeys') {
                await assertJourneyControlsAlignment(page);
                await screenshot(page, 'tablet-journeys-dark.png');
            }
        }
    }
    assert.deepEqual(pageErrors, [], 'No browser runtime exceptions are allowed.');
    await context.close();

    console.log('Malformed and invalid stored preferences fall back safely');
    const malformedContext = await browser.newContext({
        viewport: { width: 320, height: 740 },
        colorScheme: 'light',
        reducedMotion: 'reduce'
    });
    const malformedPage = await malformedContext.newPage();
    activePage = malformedPage;
    const malformedErrors = [];
    malformedPage.on('pageerror', (error) => malformedErrors.push(error.message));
    await mockApi(malformedPage);
    await malformedPage.addInitScript(() => {
        localStorage.setItem('selectedStop', '{broken');
        localStorage.setItem('journeyOrigin', JSON.stringify({ id: {}, name: [] }));
        localStorage.setItem('journeyDestination', 'null');
        localStorage.setItem('currentView', 'invalid-view');
        localStorage.setItem('selectedDuration', 'not-a-duration');
        localStorage.setItem('journeyProducts', 'null');
    });
    await malformedPage.goto(baseUrl);
    await expect(malformedPage.getByRole('combobox', { name: /^from$/i })).toHaveValue('');
    await expect(malformedPage.getByRole('combobox', { name: /^to$/i })).toHaveValue('');
    await navigate(malformedPage, 'Departures');
    await expect(malformedPage.getByRole('combobox', { name: /stop|station/i })).toHaveValue('');
    await assertNoOverflow(malformedPage, 'Malformed-storage view');
    assert.deepEqual(malformedErrors, []);
    await malformedContext.close();
    console.log('Browser QA passed. Screenshots saved in .qa/.');
} catch (error) {
    if (activePage && !activePage.isClosed()) await screenshot(activePage, 'failure.png');
    throw error;
} finally {
    await browser.close();
}

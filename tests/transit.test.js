import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
    appendLocationParams,
    computeDelaySecs,
    findCurrentStopIndex,
    formatTime,
    getLineClasses,
    getLineColor,
    getLineStyle,
    journeySummary,
    localDateValue,
    localTimeValue,
    normalizeLocation,
    normalizeStopovers,
    parseDepartures,
    parseJourneys,
    stopoverTiming,
    validLocation
} from '../src/lib/transit.js';

const stop = (id, name) => ({ type: 'stop', id, name });

test('selected stop ID takes priority over a similar name or a departure platform ID', () => {
    const stopovers = [
        { stop: stop('platform-1', 'S+U Alexanderplatz') },
        { stop: stop('station-1', 'S+U Alexanderplatz') }
    ];
    assert.equal(
        findCurrentStopIndex(
            stopovers,
            { stop: stop('platform-1', 'S+U Alexanderplatz') },
            stop('station-1', 'S+U Alexanderplatz')
        ),
        1
    );
});

test('current stop detection falls back to departure stop ID and then normalized names', () => {
    const stopovers = [
        { stop: stop('one', 'S+U Alexanderplatz') },
        { stop: stop('two', 'U Rosa-Luxemburg-Platz') }
    ];
    assert.equal(
        findCurrentStopIndex(
            stopovers,
            { stop: stop('two', 'Unknown') },
            stop('missing', 'Unknown')
        ),
        1
    );
    assert.equal(findCurrentStopIndex(stopovers, {}, { name: '  s+u ALEXANDERPLATZ  ' }), 0);
    assert.equal(findCurrentStopIndex(stopovers, {}, { name: 'Rosa-Luxemburg-Platz' }), 1);
});

test('an empty stop name cannot accidentally match every station', () => {
    const stopovers = [{ stop: { name: '' } }, { stop: { name: 'Alexanderplatz' } }];
    assert.equal(findCurrentStopIndex(stopovers, {}, { name: 'Alexanderplatz' }), 1);
    assert.equal(findCurrentStopIndex(stopovers, {}, { name: 'Potsdamer Platz' }), -1);
    assert.equal(findCurrentStopIndex(stopovers, {}, {}), -1);
});

test('delays retain zero and negative values, and unknown delay stays unknown', () => {
    assert.equal(computeDelaySecs('2026-10-22T12:02:00+02:00', '2026-10-22T12:00:00+02:00'), 120);
    assert.equal(computeDelaySecs('2026-10-22T12:00:00+02:00', '2026-10-22T12:02:00+02:00'), -120);
    assert.equal(computeDelaySecs('2026-10-22T12:00:00+02:00', '2026-10-22T12:00:00+02:00'), 0);
    assert.equal(computeDelaySecs(null, '2026-10-22T12:00:00+02:00'), null);
    assert.equal(computeDelaySecs('garbage', '2026-10-22T12:00:00+02:00'), null);
});

test('malformed times render a placeholder instead of Invalid Date', () => {
    for (const value of [
        undefined,
        null,
        '',
        'garbage',
        Infinity,
        {},
        [],
        true,
        1n,
        { toString: 'bad', valueOf: 'bad' }
    ]) {
        assert.equal(formatTime(value), '—');
    }
    assert.notEqual(formatTime('2026-10-22T12:00:00+02:00'), '—');
});

test('transit times use Berlin summer and winter time with a 24-hour clock', () => {
    assert.equal(formatTime('2026-10-22T18:45:00Z'), '20:45');
    assert.equal(formatTime('2026-12-22T18:45:00Z'), '19:45');
    assert.equal(formatTime('2026-10-21T22:00:00Z'), '00:00');
});

test('transit time formatting ignores the system locale and timezone', () => {
    const moduleUrl = new URL('../src/lib/transit.js', import.meta.url).href;
    const output = execFileSync(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            `import { formatTime } from ${JSON.stringify(moduleUrl)};
            console.log(JSON.stringify([
                formatTime('2026-10-22T18:45:00Z'),
                formatTime('2026-12-22T18:45:00Z'),
                formatTime('2026-10-21T22:00:00Z')
            ]));`
        ],
        {
            encoding: 'utf8',
            env: {
                ...process.env,
                TZ: 'America/Los_Angeles',
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8'
            }
        }
    );
    assert.deepEqual(JSON.parse(output), ['20:45', '19:45', '00:00']);
});

test('line colors use static classes and tolerate unknown or inherited property names', () => {
    assert.equal(getLineColor({ name: 'U7', product: 'subway' }), '#0080ab');
    assert.equal(getLineColor({ name: 'U 2', product: 'subway' }), '#c63927');
    assert.equal(getLineClasses({ name: 'U4', product: 'subway' }), 'bg-[#f9a800] text-black');
    assert.equal(getLineStyle({ name: 'U4', product: 'subway' }).color, '#111111');
    for (const product of ['constructor', 'toString', '__proto__', 'unknown', undefined]) {
        assert.equal(getLineColor({ product }), '#687769');
        assert.equal(getLineClasses({ product }), 'bg-stone-600 text-white');
    }
    assert.equal(getLineColor(null), '#687769');
});

test('journey summary includes walking time while counting only transit changes', () => {
    const summary = journeySummary({
        legs: [
            {
                walking: true,
                mode: 'walking',
                departure: '2026-10-22T23:50:00+02:00',
                arrival: '2026-10-22T23:55:00+02:00'
            },
            {
                departure: '2026-10-22T23:57:00+02:00',
                arrival: '2026-10-23T00:20:00+02:00',
                line: { name: 'U2' }
            },
            {
                walking: true,
                mode: 'walking',
                departure: '2026-10-23T00:20:00+02:00',
                arrival: '2026-10-23T00:22:00+02:00'
            },
            {
                departure: '2026-10-23T00:25:00+02:00',
                arrival: '2026-10-23T01:00:00+02:00',
                line: { name: 'S7' }
            }
        ]
    });
    assert.equal(summary.duration, '1h 10m');
    assert.equal(summary.minutes, 70);
    assert.equal(summary.transfers, 1);
    assert.deepEqual(
        summary.lines.map((line) => line.name),
        ['U2', 'S7']
    );
});

test('journey summary keeps explicit realtime delays, planned fallback and cancellations', () => {
    const summary = journeySummary({
        legs: [
            {
                plannedDeparture: '2026-10-22T12:00:00+02:00',
                departure: '2026-10-22T12:02:00+02:00',
                plannedArrival: '2026-10-22T12:30:00+02:00',
                departureDelay: 0,
                line: { name: 'U5' },
                cancelled: true
            }
        ]
    });
    assert.equal(summary.departureDelay, 0);
    assert.equal(summary.arrival, '2026-10-22T12:30:00+02:00');
    assert.equal(summary.arrivalDelay, null);
    assert.equal(summary.transfers, 0);
    assert.equal(summary.cancelled, true);
    assert.equal(journeySummary({ legs: [] }).duration, '—');
});

test('stopover timing prefers departures and supports both realtime platform fields', () => {
    const timing = stopoverTiming({
        departure: '2026-10-22T12:02:00+02:00',
        plannedDeparture: '2026-10-22T12:00:00+02:00',
        arrival: '2026-10-22T11:59:00+02:00',
        departurePlatform: '4',
        plannedDeparturePlatform: '2'
    });
    assert.equal(timing.actual, '2026-10-22T12:02:00+02:00');
    assert.equal(timing.delay, 120);
    assert.equal(timing.platform, '4');
    assert.equal(stopoverTiming({ arrivalPlatform: '3' }).platform, '3');
    assert.equal(stopoverTiming({ plannedArrivalPlatform: '5' }).platform, '5');
    assert.equal(stopoverTiming({ departureDelay: 0 }).delay, 0);
});

test('station endpoints use direct IDs, including restored stops without a type', () => {
    const params = new URLSearchParams();
    appendLocationParams(params, 'from', {
        ...stop('900100003', 'Alexanderplatz'),
        location: { latitude: 52.52, longitude: 13.41 }
    });
    appendLocationParams(params, 'to', {
        id: '900100001',
        name: 'Friedrichstraße',
        location: { latitude: 52.52, longitude: 13.38 }
    });
    assert.equal(params.get('from'), '900100003');
    assert.equal(params.get('to'), '900100001');
    assert.equal(params.has('from.latitude'), false);
});

test('address endpoints use dotted coordinates and address instead of a coordinate string', () => {
    const params = new URLSearchParams();
    const address = {
        type: 'location',
        address: 'Friedrichstraße 100',
        latitude: 52.52,
        longitude: 13.38
    };
    assert.equal(validLocation(address), true);
    assert.equal(normalizeLocation(address).name, 'Friedrichstraße 100');
    appendLocationParams(params, 'to', address);
    assert.equal(params.has('to'), false);
    assert.equal(params.get('to.latitude'), '52.52');
    assert.equal(params.get('to.longitude'), '13.38');
    assert.equal(params.get('to.address'), 'Friedrichstraße 100');
});

test('POIs use dotted ID, name and coordinates', () => {
    const params = new URLSearchParams();
    appendLocationParams(params, 'to', {
        type: 'location',
        id: '900980720',
        name: 'ATZE Musiktheater',
        latitude: 52.54333,
        longitude: 13.35167
    });
    assert.equal(params.get('to.id'), '900980720');
    assert.equal(params.get('to.name'), 'ATZE Musiktheater');
    assert.equal(params.get('to.latitude'), '52.54333');
    assert.equal(params.get('to.longitude'), '13.35167');
});

test('invalid locations cannot form a journey request', () => {
    for (const location of [
        null,
        {},
        { name: 'No ID or coordinates' },
        { id: '900100003' },
        { name: 'Bad coordinates', latitude: '52.5', longitude: 13.4 }
    ]) {
        assert.equal(validLocation(location), false);
        assert.throws(() => appendLocationParams(new URLSearchParams(), 'from', location));
    }
});

test('date and time form values use the local date without UTC date rollover', () => {
    const date = new Date(2026, 9, 22, 0, 5);
    assert.equal(localDateValue(date), '2026-10-22');
    assert.equal(localTimeValue(date), '00:05');
});

test('malformed stored stop IDs cannot become undefined or object journey parameters', () => {
    for (const id of [undefined, null, '', '  ', {}, [], false, Infinity]) {
        const location = {
            type: 'stop',
            id,
            name: 'Corrupt stored stop',
            latitude: 52.5,
            longitude: 13.4
        };
        assert.equal(validLocation(location), false);
        assert.throws(() => appendLocationParams(new URLSearchParams(), 'from', location));
    }
    for (const id of ['900100003', 900100003, 0]) {
        const location = { type: 'stop', id, name: 'Valid stop' };
        const params = new URLSearchParams();
        appendLocationParams(params, 'from', location);
        assert.equal(params.get('from'), String(id));
    }
    assert.equal(
        validLocation({
            type: 'location',
            id: {},
            name: 'Bad POI',
            latitude: 52.5,
            longitude: 13.4
        }),
        false
    );
    assert.equal(
        validLocation({
            type: 'location',
            name: 'Bad coordinates',
            latitude: 100,
            longitude: 13.4
        }),
        false
    );
});

const validLeg = () => ({
    origin: { name: 'Alexanderplatz' },
    destination: { name: 'Potsdamer Platz' },
    departure: '2026-10-22T12:00:00+02:00',
    plannedDeparture: '2026-10-22T12:00:00+02:00',
    arrival: '2026-10-22T12:20:00+02:00',
    plannedArrival: '2026-10-22T12:20:00+02:00',
    line: { name: 'U2', product: 'subway' }
});

test('journey parsing distinguishes a genuine empty response from corrupt records', () => {
    assert.deepEqual(parseJourneys({ journeys: [] }), []);
    const valid = { legs: [validLeg()] };
    assert.equal(parseJourneys({ journeys: [valid] }).length, 1);
    for (const invalid of [null, 5, {}, { legs: [] }, { legs: [null] }, { legs: [5] }]) {
        assert.throws(
            () => parseJourneys({ journeys: [valid, invalid] }),
            /Invalid journeys response/
        );
    }
    for (const invalid of [null, [], { journeys: null }, { journeys: {} }]) {
        assert.throws(() => parseJourneys(invalid), /Invalid journeys response/);
    }
});

test('every journey leg needs usable endpoint names and valid actual or planned times', () => {
    for (const change of [
        { origin: null },
        { destination: { name: 5 } },
        { departure: null, plannedDeparture: null },
        { arrival: 'garbage' },
        { plannedArrival: {} },
        { line: 'U2' }
    ]) {
        assert.throws(
            () =>
                parseJourneys({
                    journeys: [{ legs: [{ ...validLeg(), ...change }] }]
                }),
            /Invalid journeys response/
        );
    }
    const [journey] = parseJourneys({
        journeys: [
            {
                legs: [
                    {
                        ...validLeg(),
                        departure: null,
                        arrival: null,
                        cancelled: true,
                        origin: { address: 'Friedrichstraße 100' }
                    }
                ]
            }
        ]
    });
    assert.equal(journey.legs[0].origin.name, 'Friedrichstraße 100');
    assert.equal(journeySummary(journey).duration, '20m');
    assert.equal(journeySummary(journey).cancelled, true);
});

test('journey arrival platforms discard malformed values while preserving platform zero', () => {
    for (const platform of [undefined, null, '', '  ', {}, [], false, Infinity]) {
        const [journey] = parseJourneys({
            journeys: [{ legs: [{
                ...validLeg(),
                arrivalPlatform: platform,
                plannedArrivalPlatform: platform
            }] }]
        });
        assert.equal(journey.legs[0].arrivalPlatform, null);
        assert.equal(journey.legs[0].plannedArrivalPlatform, null);
    }
    for (const platform of [0, '0', '3a']) {
        const [journey] = parseJourneys({
            journeys: [{ legs: [{
                ...validLeg(),
                arrivalPlatform: platform,
                plannedArrivalPlatform: platform
            }] }]
        });
        assert.equal(journey.legs[0].arrivalPlatform, platform);
        assert.equal(journey.legs[0].plannedArrivalPlatform, platform);
    }
});

test('malformed ancillary stopovers do not discard an otherwise valid journey', () => {
    const [journey] = parseJourneys({
        journeys: [
            {
                legs: [
                    {
                        ...validLeg(),
                        stopovers: [
                            null,
                            'invalid',
                            {
                                stop: { name: 5 },
                                departure: { toString: 'bad' },
                                departurePlatform: {}
                            },
                            { stop: { name: 'Potsdamer Platz' } }
                        ]
                    }
                ]
            }
        ]
    });
    assert.equal(journey.legs[0].stopovers.length, 2);
    assert.equal(journey.legs[0].stopovers[0].stop.name, 'Unknown stop');
    assert.equal(journey.legs[0].stopovers[0].departure, null);
    assert.equal(stopoverTiming(journey.legs[0].stopovers[0]).platform, undefined);
    assert.equal(
        findCurrentStopIndex(journey.legs[0].stopovers, {}, { name: 'Potsdamer Platz' }),
        1
    );
    assert.equal(
        findCurrentStopIndex([null, { stop: { name: 5 } }], {}, { name: 'Potsdamer Platz' }),
        -1
    );
    assert.deepEqual(normalizeStopovers({}), []);
    assert.equal(stopoverTiming(null).delay, null);
});

test('departures preserve cancellations with planned times and reject corrupt rows', () => {
    const valid = {
        when: null,
        plannedWhen: '2026-10-22T12:00:00+02:00',
        cancelled: true,
        line: { name: 'U2' }
    };
    assert.equal(parseDepartures({ departures: [valid] })[0].cancelled, true);
    assert.deepEqual(parseDepartures({ departures: [] }), []);
    for (const invalid of [
        null,
        5,
        {},
        { ...valid, plannedWhen: null },
        { ...valid, when: {} },
        { ...valid, line: null }
    ]) {
        assert.throws(
            () => parseDepartures({ departures: [valid, invalid] }),
            /Invalid departures response/
        );
    }
    assert.throws(() => parseDepartures({ departures: {} }), /Invalid departures response/);
});

test('malformed optional line products and delay metadata cannot break presentation', () => {
    const [departure] = parseDepartures({
        departures: [
            {
                when: '2026-10-22T12:00:00+02:00',
                line: { name: 'U2', product: { toString: 'bad' } },
                delay: { valueOf: 'bad' }
            }
        ]
    });
    assert.equal(departure.delay, null);
    assert.equal(getLineColor(departure.line), '#687769');
    assert.equal(getLineColor({ product: { toString: 'bad' } }), '#687769');
    assert.equal(journeySummary({ legs: [null] }).duration, '—');
});

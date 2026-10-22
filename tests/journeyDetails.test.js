import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJourneyDetails } from '../src/lib/journeyDetails.js';

const time = (minutes) => new Date(Date.UTC(2026, 9, 22, 20, 0) + minutes * 60000).toISOString();
const ride = (departure, arrival, extra = {}) => ({
    origin: { id: 'origin', name: 'Origin' },
    destination: { id: 'destination', name: 'Destination' },
    departure: time(departure),
    arrival: time(arrival),
    line: { name: 'U2', product: 'subway' },
    ...extra
});
const walk = (departure, arrival, distance, extra = {}) => ({
    origin: { name: 'Transfer entrance' },
    destination: { name: 'Transfer exit' },
    departure: time(departure),
    arrival: time(arrival),
    walking: true,
    distance,
    ...extra
});

test('direct transit changes have an explicit transfer without inventing a walk', () => {
    const first = ride(0, 10, { arrivalPlatform: '2' });
    const second = ride(14, 25, { departurePlatform: '5' });
    const detail = buildJourneyDetails({ legs: [first, second] });
    assert.deepEqual(detail.steps.map(({ type }) => type), ['ride', 'transfer', 'ride']);
    const transfer = detail.steps[1];
    assert.equal(transfer.previousLeg, first);
    assert.equal(transfer.nextLeg, second);
    assert.equal(transfer.fromIndex, 0);
    assert.equal(transfer.toIndex, 1);
    assert.equal(transfer.minutes, 4);
    assert.equal(transfer.walkingMinutes, 0);
    assert.equal(transfer.waitMinutes, 4);
    assert.equal(transfer.distance, 0);
    assert.equal(transfer.missed, false);
    assert.deepEqual(transfer.walkingLegs, []);
    assert.equal(detail.walkingMinutes, 0);
    assert.equal(detail.walkingDistance, 0);
    assert.equal(detail.ridingMinutes, 21);
});

test('multiple internal walking legs belong to one transfer and retain the remaining wait', () => {
    const firstWalk = walk(10, 12, 100);
    const secondWalk = walk(13, 16, 180);
    const detail = buildJourneyDetails({ legs: [ride(0, 10), firstWalk, secondWalk, ride(18, 30)] });
    assert.deepEqual(detail.steps.map(({ type }) => type), ['ride', 'transfer', 'ride']);
    const transfer = detail.steps[1];
    assert.equal(transfer.fromIndex, 0);
    assert.equal(transfer.toIndex, 3);
    assert.deepEqual(transfer.walkingLegs, [firstWalk, secondWalk]);
    assert.equal(transfer.minutes, 8);
    assert.equal(transfer.walkingMinutes, 5);
    assert.equal(transfer.waitMinutes, 3);
    assert.equal(transfer.distance, 280);
    assert.equal(detail.walkingMinutes, 5);
    assert.equal(detail.walkingDistance, 280);
    assert.equal(detail.ridingMinutes, 22);
});

test('access and exit walks remain standalone and are included in walking totals', () => {
    const access = walk(0, 5, 350);
    const change = walk(15, 18, 150);
    const exit = walk(30, 34, 240);
    const detail = buildJourneyDetails({ legs: [access, ride(6, 15), change, ride(20, 30), exit] });
    assert.deepEqual(detail.steps.map(({ type }) => type), ['walk', 'ride', 'transfer', 'ride', 'walk']);
    assert.equal(detail.steps[0].leg, access);
    assert.equal(detail.steps[0].legIndex, 0);
    assert.equal(detail.steps.at(-1).leg, exit);
    assert.equal(detail.steps.at(-1).legIndex, 4);
    assert.equal(detail.steps[2].walkingMinutes, 3);
    assert.equal(detail.walkingMinutes, 12);
    assert.equal(detail.walkingDistance, 740);
    assert.equal(detail.ridingMinutes, 19);
});

test('a walking-only journey does not create transit or transfer steps', () => {
    const first = walk(0, 3, 200);
    const second = walk(3, 8, 300, { walking: false, mode: 'walking' });
    const detail = buildJourneyDetails({ legs: [first, second] });
    assert.deepEqual(detail.steps.map(({ type }) => type), ['walk', 'walk']);
    assert.equal(detail.walkingMinutes, 8);
    assert.equal(detail.walkingDistance, 500);
    assert.equal(detail.ridingMinutes, 0);
});

test('missing walking distances stay unknown while an explicitly supplied zero stays zero', () => {
    const detail = buildJourneyDetails({ legs: [ride(0, 10), walk(10, 12, undefined), ride(15, 25)] });
    assert.equal(detail.walkingDistance, null);
    assert.equal(detail.steps[1].distance, null);
    assert.equal(detail.steps[1].walkingMinutes, 2);
    assert.equal(detail.steps[1].waitMinutes, 3);
    for (const distance of [null, -1, Infinity, '150', {}]) {
        assert.equal(buildJourneyDetails({ legs: [walk(0, 2, distance)] }).walkingDistance, null);
    }
    assert.equal(buildJourneyDetails({ legs: [walk(0, 2, 0)] }).walkingDistance, 0);
});

test('unknown times remain unknown and use valid planned timestamps when available', () => {
    const first = ride(0, 10, { arrival: null, plannedArrival: time(10) });
    const second = ride(15, 25, { departure: 'invalid', plannedDeparture: time(15) });
    const known = buildJourneyDetails({ legs: [first, second] });
    assert.equal(known.steps[1].minutes, 5);
    const unknown = buildJourneyDetails({ legs: [first, walk(10, 12, 100, { arrival: null }), second] });
    assert.equal(unknown.steps[1].walkingMinutes, null);
    assert.equal(unknown.steps[1].waitMinutes, null);
    assert.equal(unknown.steps[1].missed, false);
    assert.equal(unknown.walkingMinutes, null);
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10, { arrival: null })] }).ridingMinutes, null);
});

test('real-time arrival and departure changes determine missed connections rather than planned times', () => {
    const first = ride(0, 15, { plannedArrival: time(10), arrivalDelay: 300 });
    const second = ride(16, 30, { plannedDeparture: time(18), departureDelay: -120 });
    const detail = buildJourneyDetails({ legs: [first, walk(10, 12, 100), second] });
    assert.equal(detail.steps[1].minutes, 1);
    assert.equal(detail.steps[1].walkingMinutes, 2);
    assert.equal(detail.steps[1].waitMinutes, -1);
    assert.equal(detail.steps[1].missed, true);
});

test('an explicit unreachable leg is flagged, while short and exact connections are not inferred risky', () => {
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10), ride(10, 20)] }).steps[1].missed, false);
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10), ride(10.5, 20)] }).steps[1].missed, false);
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10), ride(15, 20, { reachable: false })] }).steps[1].missed, true);
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10), ride(9.5, 20)] }).steps[1].waitMinutes, -0.5);
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10), ride(9.5, 20)] }).steps[1].missed, true);
});

test('midnight and daylight-saving boundaries use complete timestamps', () => {
    const first = ride(0, 10, { departure: '2026-10-22T23:45:00+02:00', arrival: '2026-10-22T23:58:00+02:00' });
    const second = ride(0, 10, { departure: '2026-10-23T00:05:00+02:00', arrival: '2026-10-23T00:20:00+02:00' });
    assert.equal(buildJourneyDetails({ legs: [first, second] }).steps[1].minutes, 7);
    const repeatedHour = buildJourneyDetails({ legs: [ride(0, 10, {
        departure: '2026-10-25T02:50:00+02:00',
        arrival: '2026-10-25T02:10:00+01:00'
    })] });
    assert.equal(repeatedHour.ridingMinutes, 20);
});

test('stop counts and intermediate stops use the actual leg segment without outside stops or endpoints', () => {
    const leg = ride(0, 10, {
        stopovers: [
            { stop: { id: 'before' } },
            { stop: { id: 'origin' } },
            { stop: { id: 'middle' } },
            { stop: { id: 'destination' } },
            { stop: { id: 'after' } }
        ]
    });
    const detail = buildJourneyDetails({ legs: [leg] });
    assert.equal(detail.steps[0].stopCount, 2);
    assert.deepEqual(detail.steps[0].intermediateStops, [leg.stopovers[2]]);
    const unknown = buildJourneyDetails({ legs: [ride(0, 10)] });
    assert.equal(unknown.steps[0].stopCount, null);
    assert.deepEqual(unknown.steps[0].intermediateStops, []);
    assert.deepEqual(buildJourneyDetails({ legs: [walk(0, 5, 200)] }).steps[0].intermediateStops, []);
    assert.equal(buildJourneyDetails({ legs: [ride(0, 10, { stopovers: [{ stop: { id: 'origin' } }] })] }).steps[0].stopCount, null);
    const unknownIds = ride(0, 10, {
        origin: { id: { toString: 'invalid' }, name: 'Origin' },
        stopovers: [
            { stop: { name: 'Origin' } },
            { stop: { id: 'destination', name: 'Destination' } }
        ]
    });
    assert.equal(buildJourneyDetails({ legs: [unknownIds] }).steps[0].stopCount, 1);
});

test('building details preserves cancellation data and leaves source legs unchanged', () => {
    const first = Object.freeze(ride(0, 10, { cancelled: true }));
    const second = Object.freeze(ride(15, 25));
    const legs = Object.freeze([first, second]);
    const detail = buildJourneyDetails(Object.freeze({ legs }));
    assert.equal(detail.steps[0].leg.cancelled, true);
    assert.equal(detail.steps[1].previousLeg, first);
    assert.equal(detail.steps[2].leg, second);
    assert.deepEqual(Object.keys(first), ['origin', 'destination', 'departure', 'arrival', 'line', 'cancelled']);
});

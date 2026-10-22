import assert from 'node:assert/strict';
import test from 'node:test';
import { uniqueLocations } from '../src/lib/locationSearch.js';

const stop = (id, name = 'Station', latitude = 52.5215, longitude = 13.4113) => ({
    type: 'stop', id, name, location: { latitude, longitude }
});
const place = (id, name, latitude = 52.5215, longitude = 13.4113) => ({
    type: 'location', poi: true, id, name, latitude, longitude
});

test('repeated IDs collapse even when names or numeric ID types differ', () => {
    const first = stop(123, 'First API match');
    const results = uniqueLocations([first, stop('123', 'Alias'), stop('other', 'Other')]);
    assert.deepEqual(results.map(({ id }) => id), [123, 'other']);
    assert.deepEqual(first, results[0]);
    assert.notEqual(first, results[0]);
});

test('places and addresses are excluded even when their name or ID matches a station', () => {
    const station = stop('one');
    const results = uniqueLocations([
        place('one', station.name), { ...place('one', station.name), poi: false },
        { type: 'address', id: 'address', address: 'Alexanderplatz 1', latitude: 52.52, longitude: 13.41 },
        { type: 'poi', id: 'poi', name: station.name }, station
    ]);
    assert.deepEqual(results, [station]);
});

test('station names are tidied without modifying the source or routing target', () => {
    const first = stop('one', '  Rathaus   Schönberg  ');
    const results = uniqueLocations([first]);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Rathaus Schönberg');
    assert.equal(first.name, '  Rathaus   Schönberg  ');
    assert.equal(results[0].id, first.id);
    assert.deepEqual(results[0].location, first.location);
});

test('different boarding points, towns and unknown coordinates stay separate', () => {
    const results = uniqueLocations([
        stop('one'), stop('same-coordinates'), stop('other-platform', 'Station', 52.52151),
        stop('other-town', 'Station', 53),
        { type: 'stop', id: 'no-coordinates', name: 'Station' },
        { type: 'stop', id: 'also-no-coordinates', name: 'Station' },
        stop('named-entrance', 'Station/Side street')
    ]);
    assert.equal(results.length, 7);
});

test('bad station records are ignored', () => {
    const data = [null, [], {}, stop(null), stop({}), place('place', 'Place'), stop('station')];
    assert.deepEqual(uniqueLocations(data).map(({ id }) => id), ['station']);
});

test('the result limit applies after filtering duplicates, preserving API order', () => {
    const data = [stop('one'), stop('one')];
    for (let index = 2; index <= 10; index++) data.push(stop(String(index), `Station ${index}`));
    assert.deepEqual(uniqueLocations(data).map(({ id }) => id), ['one', '2', '3', '4', '5', '6', '7', '8']);
    assert.equal(uniqueLocations(data, { limit: 10 }).length, 10);
});

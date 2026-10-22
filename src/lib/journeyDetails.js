import { timestamp } from './transit.js';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value) =>
    (typeof value === 'string' && value.trim().length > 0) ||
    (typeof value === 'number' && Number.isFinite(value));
const isWalking = (leg) => leg.walking === true || leg.mode === 'walking';
const legTime = (leg, key) => {
    const actual = timestamp(leg[key]);
    return Number.isFinite(actual) ? actual : timestamp(leg[`planned${key[0].toUpperCase()}${key.slice(1)}`]);
};
const durationMs = (leg) => {
    const duration = legTime(leg, 'arrival') - legTime(leg, 'departure');
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
};
const sumKnown = (values) =>
    values.every((value) => value !== null) ? values.reduce((total, value) => total + value, 0) : null;
const toMinutes = (duration) => duration === null ? null : duration / 60000;
const walkingDistance = (legs) => sumKnown(legs.map((leg) =>
    typeof leg.distance === 'number' && Number.isFinite(leg.distance) && leg.distance >= 0
        ? leg.distance
        : null
));
const sameStop = (first, second) => {
    if (!isRecord(first) || !isRecord(second)) return false;
    if (validId(first.id) && validId(second.id)) {
        return String(first.id) === String(second.id);
    }
    const name = (stop) => typeof stop.name === 'string' ? stop.name.trim().toLocaleLowerCase() : '';
    return Boolean(name(first)) && name(first) === name(second);
};
const stopoverSegment = (leg) => {
    if (!Array.isArray(leg.stopovers)) return null;
    const originIndex = leg.stopovers.findIndex((stopover) => sameStop(stopover?.stop, leg.origin));
    if (originIndex === -1) return null;
    const destinationIndex = leg.stopovers.findLastIndex((stopover) => sameStop(stopover?.stop, leg.destination));
    return destinationIndex > originIndex ? leg.stopovers.slice(originIndex, destinationIndex + 1) : null;
};
const legStep = ({ leg, legIndex }) => {
    const walking = isWalking(leg);
    const stopovers = walking ? null : stopoverSegment(leg);
    return {
        type: walking ? 'walk' : 'ride',
        leg,
        legIndex,
        minutes: toMinutes(durationMs(leg)),
        stopCount: stopovers === null ? null : stopovers.length - 1,
        intermediateStops: stopovers === null ? [] : stopovers.slice(1, -1)
    };
};
const transferStep = (previous, next, walking) => {
    const walkingLegs = walking.map(({ leg }) => leg);
    const walkingDuration = sumKnown(walkingLegs.map(durationMs));
    const difference = legTime(next.leg, 'departure') - legTime(previous.leg, 'arrival');
    const duration = Number.isFinite(difference) ? difference : null;
    const remaining = duration !== null && walkingDuration !== null ? duration - walkingDuration : null;

    return {
        type: 'transfer',
        previousLeg: previous.leg,
        nextLeg: next.leg,
        fromIndex: previous.legIndex,
        toIndex: next.legIndex,
        walkingLegs,
        minutes: toMinutes(duration),
        walkingMinutes: toMinutes(walkingDuration),
        waitMinutes: toMinutes(remaining),
        distance: walkingDistance(walkingLegs),
        missed: next.leg.reachable === false || (remaining !== null && remaining < 0)
    };
};

export const buildJourneyDetails = (journey) => {
    const legs = Array.isArray(journey?.legs)
        ? journey.legs.map((leg, legIndex) => ({ leg, legIndex })).filter(({ leg }) => isRecord(leg))
        : [];
    const walking = legs.filter(({ leg }) => isWalking(leg));
    const riding = legs.filter(({ leg }) => !isWalking(leg));
    const steps = [];
    let previousRide = null;
    let pendingWalks = [];

    for (const entry of legs) {
        if (isWalking(entry.leg)) {
            pendingWalks.push(entry);
            continue;
        }
        if (previousRide) {
            steps.push(transferStep(previousRide, entry, pendingWalks));
        } else {
            steps.push(...pendingWalks.map(legStep));
        }
        steps.push(legStep(entry));
        previousRide = entry;
        pendingWalks = [];
    }
    steps.push(...pendingWalks.map(legStep));

    return {
        steps,
        walkingMinutes: toMinutes(sumKnown(walking.map(({ leg }) => durationMs(leg)))),
        walkingDistance: walkingDistance(walking.map(({ leg }) => leg)),
        ridingMinutes: toMinutes(sumKnown(riding.map(({ leg }) => durationMs(leg))))
    };
};

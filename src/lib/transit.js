export const API_BASE = 'https://v6.bvg.transport.rest';

export const PRODUCTS = [
    { id: 'subway', name: 'U-Bahn', shortName: 'U' },
    { id: 'suburban', name: 'S-Bahn', shortName: 'S' },
    { id: 'tram', name: 'Tram', shortName: 'M' },
    { id: 'bus', name: 'Bus', shortName: 'B' },
    { id: 'ferry', name: 'Ferry', shortName: 'F' },
    { id: 'regional', name: 'Regional', shortName: 'RE' },
    { id: 'express', name: 'Express', shortName: 'ICE' }
];

const LINE_STYLES = {
    U1: { color: '#57a639', classes: 'bg-[#57a639] text-white' },
    U2: { color: '#c63927', classes: 'bg-[#c63927] text-white' },
    U3: { color: '#00694c', classes: 'bg-[#00694c] text-white' },
    U4: { color: '#f9a800', classes: 'bg-[#f9a800] text-black' },
    U5: { color: '#6f4a28', classes: 'bg-[#6f4a28] text-white' },
    U6: { color: '#6c4675', classes: 'bg-[#6c4675] text-white' },
    U7: { color: '#0080ab', classes: 'bg-[#0080ab] text-white' },
    U8: { color: '#004f7c', classes: 'bg-[#004f7c] text-white' },
    U9: { color: '#fa842b', classes: 'bg-[#fa842b] text-black' }
};

const PRODUCT_STYLES = {
    subway: { color: '#0080ab', classes: 'bg-[#0080ab] text-white' },
    suburban: { color: '#006e34', classes: 'bg-[#006e34] text-white' },
    tram: { color: '#cc0000', classes: 'bg-[#cc0000] text-white' },
    bus: { color: '#a3007c', classes: 'bg-[#a3007c] text-white' },
    ferry: { color: '#009ee0', classes: 'bg-[#009ee0] text-black' },
    regional: { color: '#d50000', classes: 'bg-[#d50000] text-white' },
    express: { color: '#ec0016', classes: 'bg-[#ec0016] text-white' }
};

const FALLBACK_STYLE = { color: '#687769', classes: 'bg-stone-600 text-white' };
const timeFormatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const validId = (value) => hasText(value) || (typeof value === 'number' && Number.isFinite(value));
const locationName = (location) =>
    hasText(location?.name) ? location.name : hasText(location?.address) ? location.address : '';
const finiteDelay = (value) => typeof value === 'number' && Number.isFinite(value);
const hasCoordinates = (location) =>
    isRecord(location) &&
    Number.isFinite(location.latitude) &&
    Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.longitude) <= 180;

const lineStyle = (line) => {
    const name = hasText(line?.name) ? line.name : validId(line?.id) ? String(line.id) : '';
    const match = line?.product === 'subway' && /\bU\s?([1-9])\b/i.exec(name);
    const subway = match ? LINE_STYLES[`U${match[1]}`] : null;
    const product =
        typeof line?.product === 'string' && Object.hasOwn(PRODUCT_STYLES, line.product)
            ? PRODUCT_STYLES[line.product]
            : null;
    return subway || product || FALLBACK_STYLE;
};

export const getLineColor = (line) => lineStyle(line).color;
export const getLineClasses = (line) => lineStyle(line).classes;
export const getLineStyle = (line) => ({
    backgroundColor: getLineColor(line),
    color: /text-black\b/.test(getLineClasses(line)) ? '#111111' : '#ffffff'
});

export const getProductName = (product) =>
    PRODUCTS.find((item) => item.id === product)?.name || 'Transit';

export const timestamp = (value) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'string' && typeof value !== 'number') return NaN;
    if (typeof value === 'string' && !value.trim()) return NaN;
    return new Date(value).getTime();
};

export const formatTime = (value) => {
    const time = timestamp(value);
    return Number.isFinite(time) ? timeFormatter.format(time) : '—';
};

export const computeDelaySecs = (actual, planned) => {
    const actualTime = timestamp(actual);
    const plannedTime = timestamp(planned);
    if (!Number.isFinite(actualTime) || !Number.isFinite(plannedTime)) return null;
    return Math.round((actualTime - plannedTime) / 1000);
};

export const localDateValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const localTimeValue = (date = new Date()) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const fetchJSON = async (path, { signal, timeout = 20000 } = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeout);

    try {
        const response = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, {
            signal: controller.signal,
            headers: { accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Transit service returned ${response.status}.`);
        const data = await response.json();
        if (data?.error)
            throw new Error(
                typeof data.error === 'string' ? data.error : 'Transit service is unavailable.'
            );
        return data;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
};

export const validLocation = (location) => {
    if (!isRecord(location) || !locationName(location)) return false;
    const hasId = validId(location.id);
    if (location.id !== undefined && location.id !== null && !hasId) return false;
    if (location.type === 'stop') return hasId;
    const coordinates = location.location || location;
    return hasId || hasCoordinates(coordinates);
};

export const normalizeLocation = (location) => ({
    ...location,
    name: locationName(location)
});

export const appendLocationParams = (params, prefix, location) => {
    if (!validLocation(location))
        throw new Error('Please select a location from the search results.');
    const coordinates = location.location || location;
    // Stop IDs are accepted directly. Addresses and POIs use the API's dotted parameters.
    const coordinateLocation = ['location', 'address', 'poi'].includes(location.type);
    if (validId(location.id) && (!coordinateLocation || !hasCoordinates(coordinates))) {
        params.set(prefix, location.id);
        return;
    }
    params.set(`${prefix}.latitude`, coordinates.latitude);
    params.set(`${prefix}.longitude`, coordinates.longitude);
    if (validId(location.id)) {
        params.set(`${prefix}.id`, location.id);
        params.set(`${prefix}.name`, locationName(location));
    } else {
        params.set(`${prefix}.address`, locationName(location));
    }
};

const validLine = (line) => isRecord(line) && (hasText(line.name) || validId(line.id));
const normalizeLine = (line) => ({
    ...line,
    id: validId(line.id) ? line.id : undefined,
    name: hasText(line.name) ? line.name : String(line.id),
    product: typeof line.product === 'string' ? line.product : undefined
});
const timeKeys = ['departure', 'plannedDeparture', 'arrival', 'plannedArrival'];
const platformKeys = [
    'departurePlatform',
    'arrivalPlatform',
    'platform',
    'plannedDeparturePlatform',
    'plannedArrivalPlatform',
    'plannedPlatform'
];
const validTimePair = (actual, planned) =>
    [actual, planned].every(
        (value) =>
            value === null ||
            value === undefined ||
            value === '' ||
            Number.isFinite(timestamp(value))
    ) && [actual, planned].some((value) => Number.isFinite(timestamp(value)));

export const normalizeStopovers = (stopovers) => {
    if (!Array.isArray(stopovers)) return [];
    return stopovers.filter(isRecord).map((stopover) => {
        const stop = isRecord(stopover.stop) ? stopover.stop : {};
        const normalized = {
            ...stopover,
            stop: {
                ...stop,
                id: validId(stop.id) ? stop.id : undefined,
                name: locationName(stop) || 'Unknown stop'
            }
        };
        for (const key of timeKeys)
            normalized[key] = Number.isFinite(timestamp(stopover[key])) ? stopover[key] : null;
        for (const key of platformKeys)
            normalized[key] = validId(stopover[key]) ? stopover[key] : null;
        for (const key of ['departureDelay', 'arrivalDelay'])
            normalized[key] = finiteDelay(stopover[key]) ? stopover[key] : null;
        return normalized;
    });
};

export const parseDepartures = (data) => {
    const departures = Array.isArray(data) ? data : (data?.departures ?? data?.results);
    if (!Array.isArray(departures)) throw new Error('Invalid departures response.');
    return departures.map((departure) => {
        if (
            !isRecord(departure) ||
            !validTimePair(departure.when, departure.plannedWhen) ||
            !validLine(departure.line)
        ) {
            throw new Error('Invalid departures response.');
        }
        return {
            ...departure,
            line: normalizeLine(departure.line),
            delay: finiteDelay(departure.delay) ? departure.delay : null,
            tripId: validId(departure.tripId) ? departure.tripId : null,
            direction: hasText(departure.direction) ? departure.direction : null
        };
    });
};

export const parseJourneys = (data) => {
    if (!isRecord(data) || !Array.isArray(data.journeys))
        throw new Error('Invalid journeys response. Please try again.');
    return data.journeys.map((journey) => {
        if (!isRecord(journey) || !Array.isArray(journey.legs) || !journey.legs.length) {
            throw new Error('Invalid journeys response. Please try again.');
        }
        const legs = journey.legs.map((leg) => {
            if (
                !isRecord(leg) ||
                !locationName(leg.origin) ||
                !locationName(leg.destination) ||
                !validTimePair(leg.departure, leg.plannedDeparture) ||
                !validTimePair(leg.arrival, leg.plannedArrival) ||
                (leg.line !== null && leg.line !== undefined && !validLine(leg.line))
            ) {
                throw new Error('Invalid journeys response. Please try again.');
            }
            return {
                ...leg,
                origin: { ...leg.origin, name: locationName(leg.origin) },
                destination: {
                    ...leg.destination,
                    name: locationName(leg.destination)
                },
                line: leg.line ? normalizeLine(leg.line) : undefined,
                walking: leg.walking === true || leg.mode === 'walking',
                departureDelay: finiteDelay(leg.departureDelay) ? leg.departureDelay : null,
                arrivalDelay: finiteDelay(leg.arrivalDelay) ? leg.arrivalDelay : null,
                departurePlatform: validId(leg.departurePlatform) ? leg.departurePlatform : null,
                plannedDeparturePlatform: validId(leg.plannedDeparturePlatform)
                    ? leg.plannedDeparturePlatform
                    : null,
                arrivalPlatform: validId(leg.arrivalPlatform) ? leg.arrivalPlatform : null,
                plannedArrivalPlatform: validId(leg.plannedArrivalPlatform)
                    ? leg.plannedArrivalPlatform
                    : null,
                direction: hasText(leg.direction) ? leg.direction : null,
                stopovers: normalizeStopovers(leg.stopovers)
            };
        });
        return { ...journey, legs };
    });
};

export const findCurrentStopIndex = (stopovers, departure, stop) => {
    const items = Array.isArray(stopovers) ? stopovers : [];
    const normalizedName = (value) => (hasText(value) ? value.trim().toLocaleLowerCase() : '');
    for (const candidate of [stop, departure?.stop]) {
        if (!validId(candidate?.id)) continue;
        const index = items.findIndex(
            (item) => validId(item?.stop?.id) && String(item.stop.id) === String(candidate.id)
        );
        if (index !== -1) return index;
    }

    for (const candidate of [stop, departure?.stop]) {
        const name = normalizedName(candidate?.name);
        if (!name) continue;
        const exact = items.findIndex((item) => normalizedName(item?.stop?.name) === name);
        if (exact !== -1) return exact;
        const partial = items.findIndex((item) => {
            const stopName = normalizedName(item?.stop?.name);
            return stopName && (stopName.includes(name) || name.includes(stopName));
        });
        if (partial !== -1) return partial;
    }
    return -1;
};

export const stopoverTiming = (stopover) => {
    const item = isRecord(stopover) ? stopover : {};
    const actual = [item.departure, item.arrival].find((value) =>
        Number.isFinite(timestamp(value))
    );
    const planned = [item.plannedDeparture, item.plannedArrival].find((value) =>
        Number.isFinite(timestamp(value))
    );
    const delay =
        [item.departureDelay, item.arrivalDelay].find(finiteDelay) ??
        computeDelaySecs(actual, planned);
    const platform = platformKeys.map((key) => item[key]).find(validId);
    return { actual, planned, delay, platform };
};

export const journeySummary = (journey) => {
    const legs = Array.isArray(journey?.legs) ? journey.legs.filter(isRecord) : [];
    const first = legs[0];
    const last = legs.at(-1);
    const departure = first?.departure || first?.plannedDeparture;
    const arrival = last?.arrival || last?.plannedArrival;
    const minutes = Math.max(0, Math.round((timestamp(arrival) - timestamp(departure)) / 60000));
    const transitLegs = legs.filter((leg) => !leg.walking && leg.mode !== 'walking' && leg.line);
    const duration = Number.isFinite(minutes)
        ? `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m`
        : '—';

    return {
        departure,
        arrival,
        plannedDeparture: first?.plannedDeparture || departure,
        plannedArrival: last?.plannedArrival || arrival,
        departureDelay:
            first?.departureDelay ?? computeDelaySecs(first?.departure, first?.plannedDeparture),
        arrivalDelay: last?.arrivalDelay ?? computeDelaySecs(last?.arrival, last?.plannedArrival),
        duration,
        minutes,
        transfers: Math.max(0, transitLegs.length - 1),
        lines: transitLegs.map((leg) => leg.line),
        cancelled: legs.some((leg) => leg.cancelled)
    };
};

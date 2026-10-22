import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import {
    PRODUCTS,
    appendLocationParams,
    fetchJSON,
    findCurrentStopIndex,
    localDateValue,
    localTimeValue,
    normalizeLocation,
    normalizeStopovers,
    parseDepartures,
    parseJourneys,
    timestamp,
    validLocation
} from '../lib/transit.js';
import { readStorage, readStoredJSON, writeStorage, writeStoredJSON } from '../lib/storage.js';

const REFRESH_INTERVAL_MS = 30000;
const SEARCH_DEBOUNCE_MS = 350;
const DURATIONS = [10, 20, 30, 45, 60];
const VIEWS = ['journey', 'departures', 'settings'];
const SEARCH_FIELDS = ['stop', 'origin', 'destination'];

const storedLocation = (key, stopOnly = false) => {
    const location = readStoredJSON(key);
    return validLocation(location) &&
        (!stopOnly || (location.id !== undefined && location.id !== null))
        ? normalizeLocation(location)
        : null;
};

const createSearch = (location) => ({
    query: location?.name || '',
    results: [],
    loading: false,
    error: '',
    open: false
});

export const useTransit = () => {
    const stop = storedLocation('selectedStop', true);
    const origin = storedLocation('journeyOrigin');
    const destination = storedLocation('journeyDestination');
    const storedProducts = readStoredJSON('journeyProducts', {});
    const savedDuration = Number(readStorage('selectedDuration', '30'));
    const savedView = readStorage('currentView', 'journey');
    const state = reactive({
        stop,
        currentView: VIEWS.includes(savedView) ? savedView : 'journey',
        duration: DURATIONS.includes(savedDuration) ? savedDuration : 30,
        departures: [],
        departuresLoading: false,
        departuresError: '',
        lastRefreshTime: null,
        now: Date.now(),
        journey: {
            origin,
            destination,
            journeys: [],
            loading: false,
            error: '',
            searched: false,
            date: localDateValue(),
            time: localTimeValue(),
            timeMode: 'departure',
            products: Object.fromEntries(
                PRODUCTS.map(({ id }) => [id, storedProducts?.[id] !== false])
            )
        },
        trip: {
            departure: null,
            stopovers: [],
            loading: false,
            error: '',
            open: false
        },
        searches: {
            stop: createSearch(stop),
            origin: createSearch(origin),
            destination: createSearch(destination)
        }
    });

    const searchControllers = {};
    const searchTimers = {};
    let departuresController = null;
    let journeyController = null;
    let tripController = null;
    let refreshTimer = null;
    let clockTimer = null;
    let disposed = false;

    const filteredDepartures = computed(() => {
        const minimum = state.now - 30000;
        const maximum = state.now + state.duration * 60000;
        return state.departures.filter((item) => {
            const time = timestamp(item.when || item.plannedWhen);
            return time >= minimum && time <= maximum;
        });
    });

    const currentStopIndex = computed(() =>
        findCurrentStopIndex(state.trip.stopovers, state.trip.departure, state.stop)
    );

    const setView = (view) => {
        if (!VIEWS.includes(view)) return;
        state.currentView = view;
        writeStorage('currentView', view);
    };

    const setDuration = (duration) => {
        const minutes = Number(duration);
        if (!DURATIONS.includes(minutes)) return;
        state.duration = minutes;
        state.now = Date.now();
        writeStorage('selectedDuration', minutes);
    };

    const closeSearch = (field) => {
        if (!SEARCH_FIELDS.includes(field)) return;
        clearTimeout(searchTimers[field]);
        searchControllers[field]?.abort();
        delete searchControllers[field];
        state.searches[field].open = false;
        state.searches[field].loading = false;
    };

    const refreshDepartures = async () => {
        if (state.stop?.id === undefined || state.stop?.id === null || disposed) return;
        departuresController?.abort();
        const controller = new AbortController();
        departuresController = controller;
        const stopId = state.stop.id;
        state.departuresLoading = true;
        state.departuresError = '';

        try {
            const data = await fetchJSON(
                `/stops/${encodeURIComponent(stopId)}/departures?duration=60&remarks=true&language=en&pretty=false`,
                { signal: controller.signal }
            );
            const departures = parseDepartures(data);
            if (controller.signal.aborted || disposed) return;
            state.departures = departures.sort(
                (a, b) => timestamp(a.when || a.plannedWhen) - timestamp(b.when || b.plannedWhen)
            );
            state.now = Date.now();
            state.lastRefreshTime = state.now;
        } catch {
            if (!controller.signal.aborted && !disposed) {
                state.departuresError = 'Departures could not be updated. Please try again.';
            }
        } finally {
            if (departuresController === controller) {
                state.departuresLoading = false;
                departuresController = null;
            }
        }
    };

    const selectStop = (location) => {
        if (!validLocation(location) || location.id === undefined || location.id === null) return;
        departuresController?.abort();
        state.stop = normalizeLocation(location);
        state.departures = [];
        state.lastRefreshTime = null;
        state.searches.stop.query = state.stop.name;
        closeSearch('stop');
        writeStoredJSON('selectedStop', location);
        refreshDepartures();
    };

    const selectLocation = (field, location) => {
        if (!SEARCH_FIELDS.includes(field) || !validLocation(location)) return;
        if (field === 'stop') {
            selectStop(location);
            return;
        }
        state.journey[field] = normalizeLocation(location);
        state.searches[field].query = state.journey[field].name;
        closeSearch(field);
    };

    const searchLocations = (field, query) => {
        if (!SEARCH_FIELDS.includes(field) || disposed) return;
        const search = state.searches[field];
        search.query = query;
        if (field !== 'stop' && state.journey[field]?.name !== query) {
            state.journey[field] = null;
        }
        clearTimeout(searchTimers[field]);
        searchControllers[field]?.abort();
        delete searchControllers[field];
        search.results = [];
        search.error = '';
        search.loading = false;
        const trimmed = query.trim();
        search.open = trimmed.length >= 2;
        if (trimmed.length < 2) return;

        search.loading = true;
        searchTimers[field] = setTimeout(async () => {
            const controller = new AbortController();
            searchControllers[field] = controller;
            const journeySearch = field !== 'stop';
            const params = new URLSearchParams({
                query: trimmed,
                results: '8',
                stops: 'true',
                addresses: String(journeySearch),
                poi: String(journeySearch),
                language: 'en',
                pretty: 'false'
            });

            try {
                const data = await fetchJSON(`/locations?${params}`, {
                    signal: controller.signal
                });
                if (!Array.isArray(data)) throw new Error('Invalid location response.');
                if (controller.signal.aborted || disposed) return;
                search.results = data
                    .filter(
                        (item) => validLocation(item) && (journeySearch || item.type === 'stop')
                    )
                    .map(normalizeLocation);
            } catch {
                if (!controller.signal.aborted && !disposed)
                    search.error = 'Search is unavailable. Please try again.';
            } finally {
                if (searchControllers[field] === controller) {
                    search.loading = false;
                    delete searchControllers[field];
                }
            }
        }, SEARCH_DEBOUNCE_MS);
    };

    const findNearby = async (field = 'stop') => {
        if (!SEARCH_FIELDS.includes(field) || disposed) return;
        const search = state.searches[field];
        closeSearch(field);
        search.open = true;
        search.loading = true;
        search.results = [];
        search.error = '';
        if (!navigator.geolocation) {
            search.loading = false;
            search.error = 'Your browser does not support location services.';
            return;
        }

        const controller = new AbortController();
        searchControllers[field] = controller;

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 30000
                });
            });
            if (controller.signal.aborted || disposed) return;
            const params = new URLSearchParams({
                latitude: String(position.coords.latitude),
                longitude: String(position.coords.longitude),
                results: '8',
                stops: 'true',
                poi: 'false',
                language: 'en',
                pretty: 'false'
            });
            const data = await fetchJSON(`/locations/nearby?${params}`, {
                signal: controller.signal
            });
            if (!Array.isArray(data)) throw new Error('Invalid nearby response.');
            if (controller.signal.aborted || disposed) return;
            search.results = data
                .filter((item) => validLocation(item) && item.type === 'stop')
                .map(normalizeLocation);
        } catch (error) {
            if (!controller.signal.aborted && !disposed) {
                search.error =
                    error.code === 1
                        ? 'Location access was denied. Search for a stop instead.'
                        : 'Nearby stops could not be found. Please try again.';
            }
        } finally {
            if (searchControllers[field] === controller) {
                search.loading = false;
                delete searchControllers[field];
            }
        }
    };

    const setCurrentTime = () => {
        const date = new Date();
        state.journey.date = localDateValue(date);
        state.journey.time = localTimeValue(date);
        state.journey.timeMode = 'departure';
    };

    const swapJourneyLocations = () => {
        const { origin: previousOrigin, destination: previousDestination } = state.journey;
        state.journey.origin = previousDestination;
        state.journey.destination = previousOrigin;
        state.searches.origin.query = previousDestination?.name || '';
        state.searches.destination.query = previousOrigin?.name || '';
        closeSearch('origin');
        closeSearch('destination');
    };

    const searchJourneys = async () => {
        journeyController?.abort();
        const controller = new AbortController();
        journeyController = controller;
        const journey = state.journey;
        journey.searched = true;
        journey.error = '';
        journey.journeys = [];
        journey.loading = true;

        try {
            if (!journey.origin || !journey.destination) {
                throw new Error('Please select both an origin and a destination.');
            }
            if (!PRODUCTS.some(({ id }) => journey.products[id])) {
                throw new Error(
                    'Please enable at least one mode of transport under Transport options.'
                );
            }
            const params = new URLSearchParams({
                results: '5',
                stopovers: 'true',
                remarks: 'true',
                language: 'en',
                pretty: 'false',
                scheduledDays: 'false'
            });
            appendLocationParams(params, 'from', journey.origin);
            appendLocationParams(params, 'to', journey.destination);
            if (journey.time) {
                const when = new Date(`${journey.date || localDateValue()}T${journey.time}:00`);
                if (
                    !Number.isFinite(when.getTime()) ||
                    localDateValue(when) !== journey.date ||
                    localTimeValue(when) !== journey.time
                )
                    throw new Error('Please enter a valid travel date and time.');
                params.set(
                    journey.timeMode === 'arrival' ? 'arrival' : 'departure',
                    when.toISOString()
                );
            } else {
                params.set(journey.timeMode === 'arrival' ? 'arrival' : 'departure', 'now');
            }
            for (const { id } of PRODUCTS) params.set(id, String(journey.products[id]));
            const data = await fetchJSON(`/journeys?${params}`, {
                signal: controller.signal
            });
            const journeys = parseJourneys(data);
            if (controller.signal.aborted || disposed) return;
            journey.journeys = journeys;
        } catch (error) {
            if (!controller.signal.aborted && !disposed) {
                journey.error =
                    error.name === 'AbortError'
                        ? 'The request timed out. Please try again.'
                        : error.message || 'Journeys could not be loaded. Please try again.';
            }
        } finally {
            if (journeyController === controller) {
                journey.loading = false;
                journeyController = null;
            }
        }
    };

    const showTrip = async (departure) => {
        tripController?.abort();
        const controller = new AbortController();
        tripController = controller;
        Object.assign(state.trip, {
            departure,
            stopovers: [],
            loading: true,
            error: '',
            open: true
        });

        try {
            if (!departure?.tripId)
                throw new Error('Trip details are not available for this departure.');
            const data = await fetchJSON(
                `/trips/${encodeURIComponent(departure.tripId)}?stopovers=true&remarks=true&language=en&pretty=false`,
                { signal: controller.signal }
            );
            const stopovers = data?.stopovers || data?.trip?.stopovers;
            if (!Array.isArray(stopovers) || !stopovers.length)
                throw new Error('Stop information is not available for this trip.');
            if (controller.signal.aborted || disposed) return;
            state.trip.stopovers = normalizeStopovers(stopovers);
        } catch (error) {
            if (!controller.signal.aborted && !disposed)
                state.trip.error = error.message || 'Trip details could not be loaded.';
        } finally {
            if (tripController === controller) {
                state.trip.loading = false;
                tripController = null;
            }
        }
    };

    const closeTrip = () => {
        tripController?.abort();
        tripController = null;
        state.trip.open = false;
        state.trip.loading = false;
    };

    const startRefresh = () => {
        clearInterval(refreshTimer);
        refreshTimer = setInterval(refreshDepartures, REFRESH_INTERVAL_MS);
    };

    const handleVisibility = () => {
        clearInterval(refreshTimer);
        clearInterval(clockTimer);
        if (document.hidden) return;
        state.now = Date.now();
        if (state.now - (state.lastRefreshTime || 0) >= REFRESH_INTERVAL_MS) refreshDepartures();
        startRefresh();
        clockTimer = setInterval(() => {
            state.now = Date.now();
        }, 1000);
    };

    watch(
        () => state.journey.origin,
        (location) => writeStoredJSON('journeyOrigin', location),
        { deep: true }
    );
    watch(
        () => state.journey.destination,
        (location) => writeStoredJSON('journeyDestination', location),
        { deep: true }
    );
    watch(
        () => state.journey.products,
        (products) => writeStoredJSON('journeyProducts', products),
        { deep: true }
    );

    onMounted(() => {
        document.addEventListener('visibilitychange', handleVisibility);
        handleVisibility();
    });

    onUnmounted(() => {
        disposed = true;
        clearInterval(refreshTimer);
        clearInterval(clockTimer);
        document.removeEventListener('visibilitychange', handleVisibility);
        departuresController?.abort();
        journeyController?.abort();
        tripController?.abort();
        for (const field of SEARCH_FIELDS) closeSearch(field);
    });

    return {
        state,
        filteredDepartures,
        currentStopIndex,
        selectStop,
        setView,
        setDuration,
        refreshDepartures,
        searchLocations,
        selectLocation,
        findNearby,
        closeSearch,
        searchJourneys,
        setCurrentTime,
        swapJourneyLocations,
        showTrip,
        closeTrip
    };
};

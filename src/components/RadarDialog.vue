<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AppIcon from './AppIcon.vue';
import {
    API_BASE,
    computeDelaySecs,
    fetchJSON,
    formatTime,
    getLineColor,
    getLineStyle,
    getProductName
} from '../lib/transit.js';

const props = defineProps({
    stop: { type: Object, default: null },
    departures: { type: Array, default: () => [] },
    open: { type: Boolean, default: false },
    dark: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'error']);

const REFRESH_INTERVAL = 10000;
const SEARCH_RADIUS = 0.09;
const DEFAULT_ZOOM = 14;

const dialog = ref(null);
const mapElement = ref(null);
const loading = ref(false);
const error = ref('');
const vehicleCount = ref(0);
const updatedAt = ref(null);
const hasLocation = computed(() => validLocation(props.stop?.location));
const updatedLabel = computed(() => (updatedAt.value ? formatTime(updatedAt.value) : null));

let map = null;
let tileLayer = null;
let stopMarker = null;
let resizeObserver = null;
let refreshTimer = null;
let controller = null;
let requestVersion = 0;
let fallbackDepartures = null;
let lastReportedError = '';
const markers = new Map();

function validLocation(location) {
    return (
        Number.isFinite(location?.latitude) &&
        Number.isFinite(location?.longitude) &&
        Math.abs(location.latitude) <= 90 &&
        Math.abs(location.longitude) <= 180
    );
}

function escapeHtml(value) {
    return String(value ?? '').replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]
    );
}

function vehicleIcon(vehicle) {
    const line = String(vehicle.line?.name || '?');
    const style = getLineStyle(vehicle.line);
    return L.divIcon({
        className: 'vehicle-marker',
        html: `<svg width="44" height="36" viewBox="0 0 44 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M11 2h22a9 9 0 0 1 9 9v10a9 9 0 0 1-9 9h-6l-5 4-5-4h-6a9 9 0 0 1-9-9V11a9 9 0 0 1 9-9Z" fill="${style.backgroundColor}" stroke="white" stroke-width="2"/>
            <text x="22" y="20" text-anchor="middle" font-family="inherit" font-size="${line.length > 4 ? 9 : 11}" font-weight="700" fill="${style.color}">${escapeHtml(line)}</text>
        </svg>`,
        iconSize: [44, 36],
        iconAnchor: [22, 34],
        popupAnchor: [0, -30]
    });
}

function stopIcon() {
    return L.divIcon({
        className: 'stop-marker',
        html: '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#f6d522" stroke="#22231f" stroke-width="2"/><circle cx="20" cy="20" r="12" fill="none" stroke="#22231f" stroke-width="1.5"/><text x="20" y="26" text-anchor="middle" font-family="inherit" font-size="18" font-weight="700" fill="#22231f">H</text></svg>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -18]
    });
}

function createElement(tag, className, value) {
    const element = document.createElement(tag);
    element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
}

function nextStopover(vehicle) {
    const stops = Array.isArray(vehicle.nextStopovers) ? vehicle.nextStopovers : [];
    return (
        stops.find((stop) => {
            const time =
                stop.departure || stop.plannedDeparture || stop.arrival || stop.plannedArrival;
            return new Date(time).getTime() > Date.now();
        }) || stops[0]
    );
}

function vehiclePopup(vehicle) {
    const content = createElement('div', 'radar-popup-content');
    const header = createElement('div', 'flex items-center gap-2');
    const badge = createElement(
        'span',
        'rounded-md px-2 py-1 text-xs font-bold',
        vehicle.line?.name || '?'
    );
    Object.assign(badge.style, getLineStyle(vehicle.line));
    const product = getProductName(vehicle.line?.product);
    header.append(badge, createElement('span', 'text-xs text-muted', product));
    content.append(header);

    const stops = Array.isArray(vehicle.nextStopovers) ? vehicle.nextStopovers : [];
    const destination = vehicle.direction || stops.at(-1)?.stop?.name || 'In service';
    content.append(createElement('div', 'mt-3 text-base font-semibold leading-snug', destination));

    const stopover = nextStopover(vehicle);
    if (stopover?.stop?.name) {
        const details = createElement('div', 'mt-4 border-t border-edge pt-3');
        details.append(createElement('div', 'text-xs text-muted', 'Next stop'));
        details.append(createElement('div', 'mt-1 text-sm font-medium', stopover.stop.name));
        const actual = stopover.arrival || stopover.departure;
        const planned = stopover.plannedArrival || stopover.plannedDeparture;
        const delay =
            stopover.arrivalDelay ?? stopover.departureDelay ?? computeDelaySecs(actual, planned);
        if (actual || planned) {
            const time = createElement('div', 'mt-1 flex items-center gap-2 text-sm tabular-nums');
            if (delay !== null && Math.abs(delay) >= 60) {
                if (planned)
                    time.append(
                        createElement('span', 'text-muted line-through', formatTime(planned))
                    );
                time.append(
                    createElement(
                        'span',
                        delay > 0
                            ? 'font-medium text-red-700 dark:text-red-400'
                            : 'font-medium text-sky-700 dark:text-sky-400',
                        formatTime(actual || planned)
                    )
                );
                time.append(
                    createElement(
                        'span',
                        'text-xs text-muted',
                        `${delay > 0 ? '+' : '−'}${Math.round(Math.abs(delay) / 60)} min`
                    )
                );
            } else {
                time.append(
                    createElement(
                        'span',
                        delay === 0 ? 'text-green-700 dark:text-green-400' : '',
                        formatTime(actual || planned)
                    )
                );
            }
            details.append(time);
        }
        if (Number.isFinite(vehicle.speed)) {
            details.append(
                createElement('div', 'mt-2 text-xs text-muted', `${Math.round(vehicle.speed)} km/h`)
            );
        }
        content.append(details);
    }
    return content;
}

function popup(content) {
    return L.popup({
        className: 'radar-popup',
        minWidth: 210,
        maxWidth: 260,
        autoClose: false,
        closeOnClick: false
    }).setContent(content);
}

function createTileLayer() {
    return props.dark
        ? L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            {
                attribution:
                    'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 16
            }
        )
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        });
}

function syncStopMarker() {
    if (!map) return;
    if (!hasLocation.value) {
        stopMarker?.remove();
        stopMarker = null;
        return;
    }
    const coordinates = [props.stop.location.latitude, props.stop.location.longitude];
    const content = createElement('div', 'radar-popup-content');
    content.append(createElement('div', 'text-xs text-muted', 'Your stop'));
    content.append(createElement('div', 'mt-1 text-sm font-semibold', props.stop.name));
    if (stopMarker) {
        stopMarker.setLatLng(coordinates).setPopupContent(content);
    } else {
        stopMarker = L.marker(coordinates, {
            icon: stopIcon(),
            title: props.stop.name,
            zIndexOffset: 1000
        }).addTo(map);
        stopMarker.bindPopup(popup(content));
    }
}

function syncMarkers(vehicles) {
    if (!map) return;
    const seen = new Set();
    for (const vehicle of vehicles) {
        const id = vehicle.tripId;
        seen.add(id);
        const coordinates = [vehicle.location.latitude, vehicle.location.longitude];
        const signature = `${vehicle.line?.name}:${getLineColor(vehicle.line)}`;
        const existing = markers.get(id);
        if (existing) {
            existing.marker.setLatLng(coordinates).setPopupContent(vehiclePopup(vehicle));
            if (existing.signature !== signature) {
                existing.marker.setIcon(vehicleIcon(vehicle));
                existing.signature = signature;
            }
        } else {
            const marker = L.marker(coordinates, {
                icon: vehicleIcon(vehicle),
                title: `${vehicle.line?.name || 'Vehicle'} · view next stop`
            }).addTo(map);
            marker.bindPopup(popup(vehiclePopup(vehicle)));
            markers.set(id, { marker, signature });
        }
    }
    for (const [id, entry] of markers) {
        if (!seen.has(id)) {
            entry.marker.remove();
            markers.delete(id);
        }
    }
    vehicleCount.value = markers.size;
}

function recenter(animate = true) {
    if (!map || !hasLocation.value) return;
    map.setView([props.stop.location.latitude, props.stop.location.longitude], DEFAULT_ZOOM, {
        animate: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    });
}

function pauseRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
    requestVersion += 1;
    controller?.abort();
    controller = null;
    loading.value = false;
}

async function refresh(showLoading = false) {
    if (!props.open || document.hidden) return;
    if (!hasLocation.value) {
        pauseRefresh();
        syncMarkers([]);
        error.value = 'Choose a stop with a map location to open live radar.';
        return;
    }

    window.clearTimeout(refreshTimer);
    controller?.abort();
    const version = ++requestVersion;
    const request = new AbortController();
    controller = request;
    loading.value = showLoading;
    error.value = '';
    const stop = props.stop;

    try {
        let departures = props.departures;
        if (!departures.length) {
            if (
                !fallbackDepartures ||
                fallbackDepartures.stopId !== stop.id ||
                Date.now() - fallbackDepartures.fetchedAt > 30000
            ) {
                const data = await fetchJSON(
                    `${API_BASE}/stops/${encodeURIComponent(stop.id)}/departures?duration=60&remarks=true&language=en&pretty=false`,
                    { signal: request.signal }
                );
                const items = Array.isArray(data) ? data : data?.departures || data?.results;
                if (!Array.isArray(items))
                    throw new Error('The transport service returned invalid departures.');
                if (version !== requestVersion) return;
                fallbackDepartures = {
                    stopId: stop.id,
                    departures: items,
                    fetchedAt: Date.now()
                };
            }
            departures = fallbackDepartures.departures;
        }
        const tripIds = new Set(
            departures.filter((departure) => departure?.tripId).map((departure) => departure.tripId)
        );
        let vehicles = [];
        if (tripIds.size) {
            const { latitude, longitude } = stop.location;
            const query = new URLSearchParams({
                north: latitude + SEARCH_RADIUS,
                west: longitude - SEARCH_RADIUS,
                south: latitude - SEARCH_RADIUS,
                east: longitude + SEARCH_RADIUS,
                results: 1024
            });
            const data = await fetchJSON(`${API_BASE}/radar?${query}`, {
                signal: request.signal
            });
            const movements = Array.isArray(data) ? data : data?.movements;
            if (!Array.isArray(movements))
                throw new Error('The transport service returned invalid vehicle positions.');
            vehicles = movements.filter(
                (vehicle) =>
                    vehicle?.tripId &&
                    tripIds.has(vehicle.tripId) &&
                    validLocation(vehicle.location)
            );
        }
        if (version !== requestVersion || !props.open) return;
        syncStopMarker();
        syncMarkers(vehicles);
        updatedAt.value = Date.now();
        lastReportedError = '';
    } catch {
        if (request.signal.aborted || version !== requestVersion) return;
        error.value = 'Couldn’t load vehicle positions. Please try again.';
        if (lastReportedError !== error.value) emit('error', error.value);
        lastReportedError = error.value;
    } finally {
        if (version === requestVersion) {
            controller = null;
            loading.value = false;
            if (props.open && !document.hidden)
                refreshTimer = window.setTimeout(() => refresh(), REFRESH_INTERVAL);
        }
    }
}

function destroyMap() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    map?.remove();
    map = null;
    tileLayer = null;
    stopMarker = null;
    markers.clear();
    vehicleCount.value = 0;
    updatedAt.value = null;
}

async function syncOpen(open) {
    if (!dialog.value) return;
    if (!open) {
        pauseRefresh();
        dialog.value.close();
        destroyMap();
        return;
    }
    if (!dialog.value.open) dialog.value.showModal();
    await nextTick();
    if (!props.open || !mapElement.value) return;
    if (!map) {
        const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        map = L.map(mapElement.value, {
            zoomControl: false,
            attributionControl: true,
            fadeAnimation: animate,
            zoomAnimation: animate,
            markerZoomAnimation: animate
        });
        tileLayer = createTileLayer().addTo(map);
        map.setView([52.52, 13.405], DEFAULT_ZOOM);
        resizeObserver = new ResizeObserver(() => {
            // A popup anchored before rotation can exceed a short landscape map.
            map?.closePopup();
            map?.invalidateSize({ animate: false });
        });
        resizeObserver.observe(mapElement.value);
    }
    map.invalidateSize();
    syncStopMarker();
    recenter(false);
    refresh(true);
}

function visibilityChanged() {
    if (document.hidden) pauseRefresh();
    else if (props.open) refresh(!updatedAt.value);
}

function close() {
    pauseRefresh();
    emit('close');
}

watch(() => props.open, syncOpen);
watch(
    () => [props.stop?.id, props.stop?.location?.latitude, props.stop?.location?.longitude],
    () => {
        fallbackDepartures = null;
        if (!props.open || !map) return;
        syncMarkers([]);
        syncStopMarker();
        recenter();
        refresh(true);
    }
);
watch(
    () => props.departures,
    () => {
        if (props.open) refresh(!updatedAt.value);
    }
);
watch(
    () => props.dark,
    () => {
        if (!map) return;
        tileLayer?.remove();
        tileLayer = createTileLayer().addTo(map);
        map.setMaxZoom(props.dark ? 16 : 19);
    }
);

onMounted(() => {
    document.addEventListener('visibilitychange', visibilityChanged);
    if (props.open) syncOpen(true);
});
onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', visibilityChanged);
    pauseRefresh();
    destroyMap();
});
</script>

<template>
    <dialog id="radar-modal" ref="dialog" aria-labelledby="radar-title"
        class="radar-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-2xl border-0 bg-panel p-0 text-ink shadow-2xl open:flex open:flex-col backdrop:bg-black/55"
        @cancel.prevent="close" @close="props.open && close()" @click="$event.target === dialog && close()">
        <header class="flex shrink-0 items-center justify-between gap-4 px-5 py-4 sm:px-7 sm:py-5">
            <div class="min-w-0">
                <h2 id="radar-title" class="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                    <span
                        class="size-2 shrink-0 rounded-full bg-green-600 motion-safe:animate-pulse dark:bg-green-400"></span>
                    Live radar
                </h2>
                <p class="mt-1 truncate text-sm text-muted">
                    {{ stop?.name || 'Vehicles around your stop' }}
                </p>
            </div>
            <button type="button" autofocus
                class="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:bg-white/5 dark:hover:bg-white/10"
                aria-label="Close radar" @click="close">
                <AppIcon name="close" class="size-5" />
            </button>
        </header>

        <div class="relative h-[62dvh] min-h-24 shrink bg-well sm:h-[68dvh]">
            <div id="radar-map" ref="mapElement" class="radar-map h-full w-full" role="region"
                aria-label="Live vehicle locations near your selected stop"></div>

            <div v-if="loading" class="absolute inset-0 z-1000 flex items-center justify-center bg-panel/95"
                role="status">
                <div class="flex items-center gap-3 text-sm">
                    <svg class="size-5 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="1.7" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" opacity=".2" />
                        <path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round" />
                    </svg>
                    Locating your connections…
                </div>
            </div>

            <div v-else-if="error"
                class="absolute inset-x-4 bottom-10 z-1000 mx-auto max-w-md rounded-xl bg-panel p-4 shadow-lg"
                role="alert">
                <p class="text-sm font-medium">{{ error }}</p>
                <p v-if="updatedLabel" class="mt-1 text-xs text-muted">
                    Last updated {{ updatedLabel }}
                </p>
                <button type="button"
                    class="mt-2 min-h-11 text-sm font-semibold underline decoration-black/30 underline-offset-4 dark:decoration-white/30"
                    @click="refresh(true)">
                    Try again
                </button>
            </div>

            <div v-else-if="updatedAt && !vehicleCount"
                class="pointer-events-none absolute inset-x-4 bottom-10 z-1000 mx-auto max-w-sm rounded-xl bg-panel px-4 py-3 text-center text-sm shadow-lg"
                role="status">
                No vehicles serving this stop are in range right now.
            </div>

            <div class="absolute top-4 right-4 z-1000 overflow-hidden rounded-xl bg-panel shadow-lg">
                <button type="button"
                    class="flex size-11 items-center justify-center text-xl transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:-outline-offset-3 dark:hover:bg-white/10"
                    aria-label="Zoom in" @click="map?.zoomIn()">
                    +
                </button>
                <button type="button"
                    class="flex size-11 items-center justify-center border-t border-edge text-xl transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:-outline-offset-3 dark:hover:bg-white/10"
                    aria-label="Zoom out" @click="map?.zoomOut()">
                    −
                </button>
                <button type="button"
                    class="flex size-11 items-center justify-center border-t border-edge transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:-outline-offset-3 disabled:opacity-40 dark:hover:bg-white/10"
                    aria-label="Recenter on your stop" :disabled="!hasLocation" @click="recenter()">
                    <AppIcon name="location" class="size-5" />
                </button>
            </div>
        </div>

        <footer
            class="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 text-xs text-muted sm:px-7">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span class="flex items-center gap-1.5">
                    <span class="size-2.5 rounded-full border border-ink bg-signal"></span>
                    Your stop
                </span>
                <span class="flex items-center gap-1.5">
                    <span class="size-2.5 rounded-sm bg-stone-600 dark:bg-stone-400"></span>
                    {{ vehicleCount }}
                    {{ vehicleCount === 1 ? 'vehicle' : 'vehicles' }} serving this stop
                </span>
            </div>
            <span aria-live="polite">
                {{
                    updatedLabel
                        ? `Updated ${updatedLabel} · every 10 sec`
                        : 'Live positions · every 10 sec'
                }}
            </span>
        </footer>
    </dialog>
</template>

<style scoped>
.radar-map {
    font: inherit;
    background: var(--color-well);
}

.radar-map :deep(.vehicle-marker),
.radar-map :deep(.stop-marker) {
    background: none;
    border: 0;
}

.radar-map :deep(.vehicle-marker svg),
.radar-map :deep(.stop-marker svg) {
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 18%));
}

.radar-map :deep(.leaflet-popup-content-wrapper),
.radar-map :deep(.leaflet-popup-tip) {
    background: var(--color-panel);
    color: var(--color-ink);
}

.radar-map :deep(.leaflet-popup-content-wrapper) {
    border-radius: 12px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.radar-map :deep(.leaflet-popup-content) {
    margin: 18px;
    font-family: inherit;
}

.radar-map :deep(.leaflet-popup-close-button) {
    top: 4px;
    right: 4px;
    color: var(--color-muted);
}

.radar-map :deep(.leaflet-control-attribution) {
    background: var(--color-panel);
    color: var(--color-muted);
    font-size: 11px;
}

.radar-map :deep(.leaflet-control-attribution a) {
    color: inherit;
    text-decoration: underline;
}
</style>

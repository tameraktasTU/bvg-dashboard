<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useTransit } from './composables/useTransit.js';
import { PRODUCTS, computeDelaySecs, formatTime, timestamp } from './lib/transit.js';
import { readStorage, writeStorage } from './lib/storage.js';
import AppIcon from './components/AppIcon.vue';
import LocationSearch from './components/LocationSearch.vue';
import LineBadge from './components/LineBadge.vue';
import JourneyCard from './components/JourneyCard.vue';
import TripDialog from './components/TripDialog.vue';
import JourneyDateInput from './components/JourneyDateInput.vue';
import JourneyTimeInput from './components/JourneyTimeInput.vue';

const RadarDialog = defineAsyncComponent(() => import('./components/RadarDialog.vue'));
const {
    state,
    filteredDepartures,
    currentStopIndex,
    setView,
    setDuration,
    searchLocations,
    selectLocation,
    findNearby,
    closeSearch,
    searchJourneys,
    setCurrentTime,
    swapJourneyLocations,
    refreshDepartures,
    showTrip,
    closeTrip
} = useTransit();

const savedTheme = readStorage('theme');
const dark = ref(
    savedTheme === 'dark' ||
    (!['light', 'dark'].includes(savedTheme) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
);
const radarOpen = ref(false);
const radarLoaded = ref(false);
const expandedJourney = ref(null);
const journeyResults = ref(null);
const notice = ref('');
const navigation = [
    { id: 'journey', name: 'Journeys', icon: 'route' },
    { id: 'departures', name: 'Departures', icon: 'departures' },
    { id: 'settings', name: 'Settings', icon: 'settings' }
];
const durations = [10, 20, 30, 45, 60];
const title = computed(
    () =>
        ({
            journey: 'Where are you heading?',
            departures: 'Your next departure.',
            settings: 'Make yourself at home.'
        })[state.currentView]
);
const subtitle = computed(
    () =>
        ({
            journey: 'Find your way across Berlin & Brandenburg.',
            departures: 'The next connections, right where you need them.',
            settings: 'A few preferences for your everyday journeys.'
        })[state.currentView]
);
const dateLabel = computed(() =>
    new Date(state.now).toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })
);
const clock = computed(() => formatTime(state.now));
const nextDeparture = computed(() =>
    filteredDepartures.value.find((departure) => !departure.cancelled)
);
const waitMinutes = (departure) =>
    Math.max(
        0,
        Math.ceil((timestamp(departure.when || departure.plannedWhen) - state.now) / 60000)
    );
const delay = (departure) =>
    departure.delay ?? computeDelaySecs(departure.when, departure.plannedWhen);

watch(
    dark,
    (value) => {
        document.documentElement.classList.toggle('dark', value);
        document.documentElement.dataset.theme = value ? 'dark' : 'light';
        writeStorage('theme', value ? 'dark' : 'light');
    },
    { immediate: true }
);
watch(
    () => state.journey.journeys,
    (journeys) => {
        expandedJourney.value = null;
        if (!journeys.length || state.currentView !== 'journey' || !journeyResults.value) return;

        const results = journeyResults.value;
        const firstJourney = results.querySelector('article');
        if (!firstJourney) return;

        const navigation = document.querySelector('nav[aria-label="Mobile navigation"]');
        const visibleBottom = navigation?.getClientRects().length
            ? navigation.getBoundingClientRect().top - 16
            : window.innerHeight - 24;
        const top = results.getBoundingClientRect().top;
        if (top <= 12 || firstJourney.getBoundingClientRect().bottom <= visibleBottom) return;

        results.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            block: 'start'
        });
    },
    { flush: 'post' }
);

function openRadar() {
    radarLoaded.value = true;
    radarOpen.value = true;
}

function switchView(view) {
    setView(view);
    notice.value = '';
}
</script>

<template>
    <div class="flex min-h-dvh flex-col">
        <a href="#main"
            class="fixed top-3 left-4 z-100 -translate-y-24 rounded-lg bg-ink px-4 py-3 text-sm text-panel focus:translate-y-0">
            Skip to content
        </a>

        <header class="border-b border-edge">
            <div class="mx-auto flex h-22 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                <a href="#" class="flex shrink-0 items-center gap-3 rounded-md" aria-label="BVG Dashboard home"
                    @click.prevent="switchView('journey')">
                    <img src="/bvg-logo.svg" alt="" class="size-11 shrink-0 object-contain" />
                    <span>
                        <span class="block text-base font-semibold tracking-tight">
                            BVG Dashboard
                        </span>
                        <span class="block text-xs text-muted">Berlin & Brandenburg</span>
                    </span>
                </a>
                <nav aria-label="Desktop navigation" class="hidden items-center gap-1 rounded-full bg-well p-1 md:flex">
                    <button v-for="item in navigation" :key="item.id" type="button"
                        class="flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors" :class="state.currentView === item.id
                                ? 'bg-panel text-ink'
                                : 'text-muted hover:text-ink'
                            " :aria-current="state.currentView === item.id ? 'page' : undefined"
                        @click="switchView(item.id)">
                        <AppIcon :name="item.icon" class="size-4" />
                        {{ item.name }}
                    </button>
                </nav>
                <button type="button"
                    class="grid size-10 shrink-0 place-items-center rounded-full border border-edge transition-colors hover:bg-well"
                    :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'" @click="dark = !dark">
                    <AppIcon :name="dark ? 'sun' : 'moon'" class="size-4.5" />
                </button>
            </div>
        </header>

        <!-- 12 equal columns, eleven 16px gutters; 5 + 7 spans share the same edges. -->
        <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-5 pt-9 pb-8 sm:px-8 sm:pt-12">
            <div class="mb-8 flex items-end justify-between gap-4 sm:mb-9">
                <div>
                    <h1 class="text-2xl font-medium tracking-tight sm:text-3xl sm:leading-tight">
                        {{ title }}
                    </h1>
                    <p class="mt-2 text-sm text-muted">{{ subtitle }}</p>
                </div>
                <div class="hidden shrink-0 text-right sm:block">
                    <p class="text-lg tabular-nums">
                        {{ clock }}
                        <span class="ml-2 text-xs text-muted">Berlin</span>
                    </p>
                    <p class="mt-1 text-xs text-muted">{{ dateLabel }}</p>
                </div>
            </div>

            <Transition name="switch" mode="out-in">
                <section v-if="state.currentView === 'journey'" key="journey" aria-label="Journey planner"
                    class="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
                    <div class="min-w-0 space-y-4 lg:col-span-5">
                        <form class="rounded-2xl bg-well p-5 sm:p-6" @submit.prevent="searchJourneys">
                            <div class="mb-6 flex items-center justify-between">
                                <h2 class="text-base font-semibold">Plan a journey</h2>
                                <AppIcon name="route" class="size-5 text-muted" />
                            </div>
                            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                                <div class="min-w-0 space-y-4">
                                    <LocationSearch id="journey-origin" label="From" placeholder="e.g. Alexanderplatz"
                                        :search="state.searches.origin" nearby
                                        @search="searchLocations('origin', $event)"
                                        @select="selectLocation('origin', $event)" @nearby="findNearby('origin')"
                                        @close="closeSearch('origin')" />
                                    <LocationSearch id="journey-destination" label="To"
                                        placeholder="e.g. Zoologischer Garten" :search="state.searches.destination"
                                        marker="square" @search="searchLocations('destination', $event)"
                                        @select="selectLocation('destination', $event)"
                                        @close="closeSearch('destination')" />
                                </div>
                                <button type="button"
                                    class="mt-7 grid size-11 place-items-center rounded-full border border-edge bg-panel text-muted transition-colors hover:bg-panel/70 hover:text-ink"
                                    aria-label="Swap origin and destination" @click="swapJourneyLocations">
                                    <AppIcon name="swap" class="size-4.5" />
                                </button>
                            </div>
                            <div class="mt-6 flex items-center justify-between gap-3">
                                <label for="journey-mode" class="sr-only">Journey time mode</label>
                                <select id="journey-mode" v-model="state.journey.timeMode"
                                    class="min-w-0 bg-transparent py-2 text-sm font-medium">
                                    <option value="departure">Depart at</option>
                                    <option value="arrival">Arrive by</option>
                                </select>
                                <button type="button"
                                    class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:text-ink"
                                    @click="setCurrentTime">
                                    <AppIcon name="clock" class="size-3.5" />
                                    Now
                                </button>
                            </div>
                            <div class="mt-2 grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                                <label for="journey-date" class="sr-only">Journey date</label>
                                <JourneyDateInput id="journey-date" v-model="state.journey.date" />
                                <label for="journey-time" class="sr-only">Journey time</label>
                                <JourneyTimeInput id="journey-time" v-model="state.journey.time" />
                            </div>
                            <details class="mt-5 border-t border-edge pt-4">
                                <summary class="flex list-none items-center justify-between gap-2 text-xs text-muted">
                                    Transport options
                                    <AppIcon name="down" class="size-3.5" />
                                </summary>
                                <div class="mt-4 flex flex-wrap gap-x-4 gap-y-3">
                                    <label v-for="product in PRODUCTS" :key="product.id"
                                        class="flex cursor-pointer items-center gap-2 text-xs">
                                        <input v-model="state.journey.products[product.id]" type="checkbox"
                                            class="size-3.5 accent-ink" />
                                        {{ product.name }}
                                    </label>
                                </div>
                            </details>
                            <button type="submit" :disabled="state.journey.loading"
                                class="mt-6 flex h-12 w-full items-center justify-between rounded-xl bg-ink px-4 text-sm font-medium text-panel transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-65">
                                <span>
                                    {{
                                        state.journey.loading
                                            ? 'Finding connections…'
                                            : 'Find journeys'
                                    }}
                                </span>
                                <AppIcon :name="state.journey.loading ? 'refresh' : 'arrow'" class="size-4.5"
                                    :class="state.journey.loading && 'animate-spin'" />
                            </button>
                        </form>
                        <div class="flex items-start gap-3 px-1 text-xs leading-relaxed text-muted">
                            <AppIcon name="info" class="mt-0.5 size-4 shrink-0" />
                            <p>
                                From the first U-Bahn to the last night bus.
                                <br />
                                Live connections across Berlin & Brandenburg.
                            </p>
                        </div>
                    </div>

                    <div ref="journeyResults" class="min-w-0 scroll-mt-3 lg:col-span-7"
                        :class="state.journey.journeys.length && 'pb-12 lg:pb-0'">
                        <div class="mb-4 flex min-h-7 flex-wrap items-center justify-between gap-2 px-1">
                            <h2 class="text-sm font-semibold">
                                {{
                                    state.journey.searched
                                        ? 'Your connections'
                                        : 'Your journey starts here'
                                }}
                            </h2>
                            <span v-if="state.journey.journeys.length" class="text-xs text-muted">
                                {{ state.journey.journeys.length }} connections
                            </span>
                            <span v-else class="flex items-center gap-1.5 text-xs text-muted">
                                <AppIcon name="route" class="size-3.5" />
                                Made for Berlin
                            </span>
                        </div>
                        <div v-if="state.journey.loading" role="status"
                            class="rounded-2xl border border-edge bg-panel p-8">
                            <p class="flex items-center gap-3 text-sm">
                                <AppIcon name="refresh" class="size-4 animate-spin" />
                                Finding the best connections…
                            </p>
                            <div class="mt-6 space-y-4 motion-safe:animate-pulse" aria-hidden="true">
                                <div class="h-5 w-2/3 rounded bg-well"></div>
                                <div class="h-5 w-1/2 rounded bg-well"></div>
                            </div>
                        </div>
                        <div v-else-if="state.journey.error" role="alert"
                            class="rounded-2xl border border-red-300 bg-panel p-6 text-sm text-red-800 dark:border-red-900 dark:text-red-300">
                            <p>{{ state.journey.error }}</p>
                            <button type="button" class="mt-4 rounded-md font-medium underline underline-offset-4"
                                @click="searchJourneys">
                                Try again
                            </button>
                        </div>
                        <div v-else-if="state.journey.journeys.length" class="space-y-3">
                            <JourneyCard v-for="(journey, index) in state.journey.journeys" :key="index"
                                :journey="journey" :index="index" :expanded="expandedJourney === index"
                                @toggle="expandedJourney = expandedJourney === index ? null : index" />
                        </div>
                        <div v-else-if="state.journey.searched"
                            class="rounded-2xl border border-edge bg-panel p-8 text-sm text-muted">
                            No connections found. Try a different time or transport option.
                        </div>
                        <div v-else class="overflow-hidden rounded-2xl border border-edge bg-panel">
                            <div class="relative flex h-46 items-center justify-center overflow-hidden bg-well/50 sm:h-54"
                                aria-hidden="true">
                                <svg class="absolute inset-0 size-full text-edge" viewBox="0 0 620 216"
                                    preserveAspectRatio="xMidYMid slice" fill="none">
                                    <path
                                        d="M-20 155h200c20 0 25-65 55-65h410M-20 50h110c32 0 32 105 75 105h480M65-20v90c0 25 60 30 60 55v110M430-20v85c0 45-90 45-90 90v80"
                                        stroke="currentColor" stroke-width="2" />
                                    <g fill="var(--color-panel)" stroke="currentColor" stroke-width="2">
                                        <circle cx="125" cy="100" r="6" />
                                        <circle cx="186" cy="155" r="6" />
                                        <circle cx="340" cy="155" r="6" />
                                        <circle cx="430" cy="65" r="6" />
                                    </g>
                                </svg>
                                <div
                                    class="relative flex items-center gap-4 rounded-2xl border border-edge bg-panel px-6 py-5">
                                    <span
                                        class="grid size-10 place-items-center rounded-xl bg-signal text-lg font-semibold text-stone-950">
                                        A
                                    </span>
                                    <span class="flex items-center gap-1.5">
                                        <span class="size-1 rounded-full bg-muted/30"></span>
                                        <span class="size-1 rounded-full bg-muted/30"></span>
                                        <AppIcon name="arrow" class="size-5 text-muted" />
                                    </span>
                                    <span class="grid size-10 place-items-center rounded-xl border border-edge text-lg">
                                        B
                                    </span>
                                </div>
                            </div>
                            <div class="p-6 sm:p-8">
                                <h3 class="text-xl font-medium tracking-tight">
                                    A little less waiting.
                                    <br />
                                    A little more Berlin.
                                </h3>
                                <p class="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                                    Choose your starting point and destination. We’ll find the
                                    connections, transfers and walking routes in between.
                                </p>
                                <div class="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted">
                                    <span class="font-medium text-ink">
                                        One city. Every connection.
                                    </span>
                                    <span>U-Bahn · S-Bahn · Tram · Bus · more</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section v-else-if="state.currentView === 'departures'" key="departures" aria-label="Live departures"
                    class="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
                    <div class="min-w-0 space-y-4 lg:col-span-5">
                        <div class="rounded-2xl bg-well p-5 sm:p-6">
                            <h2 class="mb-6 text-base font-semibold">Find your stop</h2>
                            <LocationSearch id="departure-stop" label="Stop or station"
                                placeholder="e.g. Alexanderplatz" :search="state.searches.stop" nearby
                                @search="searchLocations('stop', $event)" @select="selectLocation('stop', $event)"
                                @nearby="findNearby('stop')" @close="closeSearch('stop')" />
                            <p class="mt-6 text-sm font-medium">Time window</p>
                            <div class="mt-3 flex rounded-xl bg-panel p-1" aria-label="Departure time window">
                                <button v-for="minutes in durations" :key="minutes" type="button"
                                    :aria-pressed="state.duration === minutes"
                                    class="h-10 min-w-0 flex-1 rounded-lg text-sm tabular-nums transition-colors"
                                    :class="state.duration === minutes
                                            ? 'bg-ink text-panel'
                                            : 'text-muted hover:text-ink'
                                        " @click="setDuration(minutes)">
                                    {{ minutes }}m
                                </button>
                            </div>
                            <div
                                class="mt-6 flex items-center justify-between gap-3 border-t border-edge pt-4 text-xs text-muted">
                                <span>Refreshes every 30 seconds</span>
                                <button type="button"
                                    class="flex items-center gap-1.5 rounded-md p-1 transition-colors hover:text-ink disabled:opacity-50"
                                    :disabled="!state.stop || state.departuresLoading" aria-label="Refresh departures"
                                    @click="refreshDepartures">
                                    <AppIcon name="refresh" class="size-3.5"
                                        :class="state.departuresLoading && 'animate-spin'" />
                                    Refresh
                                </button>
                            </div>
                        </div>
                        <div v-if="state.stop" class="rounded-2xl border border-edge p-5 sm:p-6">
                            <p class="text-xs text-muted">
                                {{ nextDeparture ? 'Next connection' : 'Selected stop' }}
                            </p>
                            <div v-if="nextDeparture" class="mt-3 flex items-center justify-between gap-3">
                                <LineBadge :line="nextDeparture.line" />
                                <p class="text-2xl tabular-nums">
                                    {{ waitMinutes(nextDeparture) || 'Now' }}
                                    <span v-if="waitMinutes(nextDeparture)" class="ml-1.5 text-sm text-muted">
                                        min
                                    </span>
                                </p>
                            </div>
                            <p class="mt-3 text-sm font-medium">
                                {{ nextDeparture?.direction || state.stop.name }}
                            </p>
                            <p v-if="nextDeparture" class="mt-1 text-xs text-muted">
                                from {{ state.stop.name }}
                            </p>
                            <button type="button"
                                class="mt-5 flex w-full items-center justify-between border-t border-edge pt-4 text-sm"
                                @click="openRadar">
                                <span class="flex items-center gap-2">
                                    <AppIcon name="radar" class="size-4" />
                                    Open live radar
                                </span>
                                <AppIcon name="arrow" class="size-4" />
                            </button>
                        </div>
                    </div>
                    <div class="min-w-0 overflow-hidden rounded-2xl border border-edge bg-panel lg:col-span-7">
                        <div class="flex items-center justify-between gap-3 border-b border-edge p-5 sm:px-6">
                            <div class="min-w-0">
                                <h2 class="text-base font-semibold">Departures</h2>
                                <p class="mt-1 truncate text-xs text-muted">
                                    {{ state.stop?.name || 'Pick a stop to see what’s coming.' }}
                                </p>
                            </div>
                            <span v-if="state.stop" class="shrink-0 text-xs text-muted">
                                {{ filteredDepartures.length }} departures
                            </span>
                        </div>
                        <p v-if="state.departuresError" role="alert"
                            class="border-b border-edge px-6 py-4 text-sm text-red-700 dark:text-red-300">
                            {{ state.departuresError }}
                        </p>
                        <p v-if="state.departuresLoading && !state.departures.length" role="status"
                            class="flex items-center gap-2 px-6 py-12 text-sm text-muted">
                            <AppIcon name="refresh" class="size-4 animate-spin" />
                            Updating departures…
                        </p>
                        <template v-else-if="filteredDepartures.length">
                            <table class="w-full table-fixed text-sm" aria-label="Departures">
                                <thead>
                                    <tr class="text-xs font-normal text-muted">
                                        <th class="w-17 py-4 pl-5 text-left font-normal sm:pl-6">
                                            Line
                                        </th>
                                        <th class="py-4 pl-3 text-left font-normal">Destination</th>
                                        <th class="w-20 py-4 pr-5 text-right font-normal sm:pr-6">
                                            Departure
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(departure, index) in filteredDepartures"
                                        :key="`${departure.tripId}-${index}`"
                                        class="group cursor-pointer border-t border-edge/65 transition-colors hover:bg-well/50"
                                        :class="departure.cancelled && 'text-muted'" @click="showTrip(departure)">
                                        <td class="py-4 pl-5 align-top sm:pl-6">
                                            <LineBadge :line="departure.line" />
                                        </td>
                                        <td class="min-w-0 py-4 pr-2 pl-3">
                                            <button type="button"
                                                class="w-full rounded-xs text-left text-sm font-medium"
                                                :aria-label="`View ${departure.line?.name || 'line'} to ${departure.direction || 'destination'} route`"
                                                @click.stop="showTrip(departure)">
                                                {{ departure.direction || 'Unknown destination' }}
                                            </button>
                                            <p class="mt-1 text-xs text-muted">
                                                <span v-if="departure.cancelled" class="text-red-700 dark:text-red-300">
                                                    Cancelled
                                                </span>
                                                <span v-else-if="Math.abs(delay(departure)) >= 60" :class="delay(departure) > 0
                                                        ? 'text-red-700 dark:text-red-300'
                                                        : ''
                                                    ">
                                                    {{ delay(departure) > 0 ? '+' : ''
                                                    }}{{ Math.round(delay(departure) / 60) }}
                                                    min
                                                </span>
                                                <span v-else>
                                                    {{
                                                        delay(departure) === null
                                                            ? 'Scheduled'
                                                            : 'On time'
                                                    }}
                                                </span>
                                                <span v-if="
                                                    departure.platform ||
                                                    departure.plannedPlatform
                                                ">
                                                    · Pl.
                                                    {{
                                                        departure.platform ||
                                                        departure.plannedPlatform
                                                    }}
                                                </span>
                                            </p>
                                        </td>
                                        <td class="py-4 pr-5 text-right align-top tabular-nums sm:pr-6">
                                            <p :class="departure.cancelled && 'line-through'">
                                                {{
                                                    formatTime(
                                                        departure.when || departure.plannedWhen
                                                    )
                                                }}
                                            </p>
                                            <s v-if="Math.abs(delay(departure)) >= 60"
                                                class="mt-1 block text-xs text-muted">
                                                {{ formatTime(departure.plannedWhen) }}
                                            </s>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </template>
                        <div v-else class="px-6 py-12">
                            <AppIcon name="departures" class="mb-5 size-9 text-muted" />
                            <h3 class="text-lg font-medium">
                                {{ state.stop ? 'A quiet moment.' : 'Every minute matters.' }}
                            </h3>
                            <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                                {{
                                    state.stop
                                        ? 'No departures in this window. Try a longer time window or refresh the board.'
                                        : 'Search for a station or use your location to see upcoming departures and live
                                delays.'
                                }}
                            </p>
                        </div>
                        <div v-if="state.lastRefreshTime"
                            class="flex items-center gap-2 border-t border-edge px-5 py-3 text-xs text-muted sm:px-6">
                            <AppIcon name="clock" class="size-3.5" />
                            Last updated {{ formatTime(state.lastRefreshTime) }}
                        </div>
                    </div>
                </section>

                <section v-else key="settings" aria-label="Settings" class="space-y-8">
                    <div class="grid gap-5 border-b border-edge pb-8 md:grid-cols-12">
                        <div class="md:col-span-5">
                            <h2 class="text-base font-semibold">Appearance</h2>
                            <p class="mt-2 text-sm text-muted">
                                Daylight or the last train home.
                                <br />
                                Choose what feels right.
                            </p>
                        </div>
                        <div class="rounded-2xl bg-well p-5 sm:p-6 md:col-span-7">
                            <label class="flex cursor-pointer items-center justify-between gap-4">
                                <span>
                                    <span class="block text-sm font-medium">Dark mode</span>
                                    <span class="mt-1 block text-xs text-muted">
                                        {{
                                            dark
                                                ? 'Easy on the eyes after dark.'
                                                : 'A brighter view for your daily commute.'
                                        }}
                                    </span>
                                </span>
                                <input v-model="dark" type="checkbox" role="switch" aria-label="Dark mode"
                                    class="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-muted/30 transition-colors before:absolute before:top-1 before:left-1 before:size-4 before:rounded-full before:bg-panel before:transition-transform checked:bg-ink checked:before:translate-x-5" />
                            </label>
                            <div class="mt-6 rounded-xl border border-edge bg-panel p-4" aria-hidden="true">
                                <div class="flex items-center justify-between text-xs">
                                    <span class="font-medium">Your next connection</span>
                                    <AppIcon name="moon" class="size-4 text-muted" />
                                </div>
                                <div class="mt-4 flex items-center gap-3">
                                    <span class="rounded-md bg-signal px-2 py-1 text-xs font-semibold text-stone-950">
                                        BVG
                                    </span>
                                    <span class="text-sm">Berlin, on your terms.</span>
                                </div>
                            </div>
                            <p class="mt-3 text-xs text-muted">
                                Saved automatically on this device.
                            </p>
                        </div>
                    </div>
                    <div class="grid gap-5 md:grid-cols-12">
                        <div class="md:col-span-5">
                            <h2 class="text-base font-semibold">About the dashboard</h2>
                            <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted">
                                An independent companion for getting around Berlin & Brandenburg.
                            </p>
                        </div>
                        <dl class="divide-y divide-edge rounded-2xl bg-well px-5 sm:px-6 md:col-span-7">
                            <div class="flex justify-between gap-4 py-5 text-sm">
                                <dt class="text-muted">Made by</dt>
                                <dd>
                                    <a href="https://tameraktas.de" target="_blank" rel="noopener noreferrer"
                                        class="inline-flex items-center gap-2 hover:underline">
                                        Tamer Aktas
                                        <AppIcon name="external" class="size-3.5" />
                                    </a>
                                </dd>
                            </div>
                            <div class="flex justify-between gap-4 py-5 text-sm">
                                <dt class="text-muted">Transit data</dt>
                                <dd>
                                    <a href="https://v6.bvg.transport.rest" target="_blank" rel="noopener noreferrer"
                                        class="inline-flex items-center gap-2 hover:underline">
                                        transport.rest
                                        <AppIcon name="external" class="size-3.5" />
                                    </a>
                                </dd>
                            </div>
                            <div class="flex justify-between gap-4 py-5 text-sm">
                                <dt class="text-muted">Built with</dt>
                                <dd class="text-right">Vue 3 & Tailwind CSS</dd>
                            </div>
                            <div class="py-5 text-xs leading-relaxed text-muted">
                                Realtime information is provided when available. Service times and
                                connections can change. Your selected stops and preferences are
                                saved locally in your browser.
                            </div>
                        </dl>
                    </div>
                </section>
            </Transition>
            <p v-if="notice" role="alert" class="mt-5 rounded-xl border border-edge bg-panel p-4 text-sm">
                {{ notice }}
            </p>
        </main>

        <footer
            class="mx-auto mt-5 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pt-6 pb-30 text-xs text-muted sm:px-8 md:pb-7">
            <span>Made for the way Berlin moves.</span>
            <a href="https://v6.bvg.transport.rest" target="_blank" rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-sm hover:text-ink">
                Data by transport.rest
                <AppIcon name="external" class="size-3" />
            </a>
        </footer>

        <nav aria-label="Mobile navigation"
            class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm rounded-2xl border border-edge bg-panel p-1.5 shadow-xl shadow-black/10 md:hidden">
            <button v-for="item in navigation" :key="item.id" type="button"
                class="flex min-h-15 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors"
                :class="state.currentView === item.id ? 'bg-ink text-panel' : 'text-muted'"
                :aria-current="state.currentView === item.id ? 'page' : undefined" @click="switchView(item.id)">
                <AppIcon :name="item.icon" class="size-5" />
                {{ item.name }}
            </button>
        </nav>

        <TripDialog :trip="state.trip" :current-index="currentStopIndex" @close="closeTrip" />
        <RadarDialog v-if="radarLoaded" :stop="state.stop" :departures="state.departures" :open="radarOpen" :dark="dark"
            @close="radarOpen = false" @error="notice = $event" />
    </div>
</template>

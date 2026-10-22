<script setup>
import { computed } from 'vue';
import { computeDelaySecs, formatTime, getLineColor, stopoverTiming } from '../lib/transit.js';
import AppIcon from './AppIcon.vue';
import LineBadge from './LineBadge.vue';

const props = defineProps({
    step: { type: Object, required: true },
    formatDuration: { type: Function, required: true },
    formatDistance: { type: Function, required: true }
});
const leg = computed(() => props.step.leg);
const walking = computed(() => props.step.type === 'walk');
const departureDelay = computed(() => leg.value.departureDelay ?? computeDelaySecs(leg.value.departure, leg.value.plannedDeparture));
const arrivalDelay = computed(() => leg.value.arrivalDelay ?? computeDelaySecs(leg.value.arrival, leg.value.plannedArrival));
const departurePlatform = computed(() => leg.value.departurePlatform ?? leg.value.plannedDeparturePlatform);
const arrivalPlatform = computed(() => leg.value.arrivalPlatform ?? leg.value.plannedArrivalPlatform);
const platformChanged = (actual, planned) => actual != null && planned != null && String(actual) !== String(planned);
</script>

<template>
    <div
        data-journey-leg
        class="grid grid-cols-[2.75rem_1rem_minmax(0,1fr)] gap-x-2.5 text-sm [--route-color:var(--line-color)] sm:grid-cols-[3.25rem_1rem_minmax(0,1fr)] sm:gap-x-3 dark:[--route-color:color-mix(in_srgb,var(--line-color)_80%,white)]"
        :style="{ '--line-color': walking ? 'var(--color-muted)' : getLineColor(leg.line) }"
    >
        <div class="pt-0.5 text-right tabular-nums">
            <p class="font-medium">{{ formatTime(leg.departure || leg.plannedDeparture) }}</p>
            <s v-if="Math.abs(departureDelay) >= 60" class="mt-0.5 block text-xs text-muted">
                {{ formatTime(leg.plannedDeparture) }}
            </s>
        </div>
        <div class="relative" aria-hidden="true">
            <span class="absolute top-2.5 bottom-0 left-1.5 w-1 bg-(--route-color)"></span>
            <span class="absolute top-0.75 left-0.25 size-3.5 rounded-full bg-(--route-color)"></span>
        </div>
        <div class="min-w-0" data-journey-origin>
            <p class="font-semibold leading-5 wrap-anywhere">{{ leg.origin?.name || leg.origin?.address }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span v-if="!walking">Board here</span>
                <span v-if="departurePlatform != null" class="inline-flex items-center gap-1">
                    <AppIcon name="platform" class="size-3.5" />
                    Platform {{ departurePlatform }}
                </span>
                <span v-if="platformChanged(leg.departurePlatform, leg.plannedDeparturePlatform)" class="text-amber-800 dark:text-amber-300">
                    was {{ leg.plannedDeparturePlatform }}
                </span>
            </p>
        </div>

        <div class="col-start-2 relative" aria-hidden="true">
            <span class="absolute inset-y-0 left-1.5 w-1 bg-(--route-color)"></span>
        </div>
        <div class="min-w-0 py-4 sm:py-5">
            <div v-if="walking" class="flex flex-wrap items-center gap-2 font-medium">
                <AppIcon name="walk" class="size-4.5 text-muted" />
                <span>Walk {{ formatDuration(step.minutes) }}</span>
                <span v-if="leg.distance != null" class="text-xs font-normal text-muted">
                    {{ formatDistance(leg.distance) }}
                </span>
            </div>
            <template v-else>
                <div class="flex flex-wrap items-center gap-2">
                    <LineBadge :line="leg.line" class="h-7 min-w-10 text-sm" />
                    <span class="text-xs font-medium text-muted">
                        {{ formatDuration(step.minutes) }} ride
                    </span>
                    <span v-if="step.stopCount != null" class="text-xs text-muted">
                        {{ step.stopCount }} {{ step.stopCount === 1 ? 'stop' : 'stops' }}
                    </span>
                </div>
                <p class="mt-2 text-xs leading-relaxed text-muted wrap-anywhere">
                    towards {{ leg.direction || leg.destination?.name }}
                </p>
                <p v-if="departureDelay >= 60" class="mt-2 text-xs text-red-700 dark:text-red-300">
                    {{ formatDuration(departureDelay / 60) }} departure delay
                </p>
                <details v-if="step.intermediateStops.length" class="group mt-3 text-xs">
                    <summary class="flex min-h-11 list-none items-center gap-2 text-muted hover:text-ink sm:min-h-8">
                        <span>{{ step.intermediateStops.length }} intermediate {{ step.intermediateStops.length === 1 ? 'stop' : 'stops' }}</span>
                        <AppIcon name="down" class="size-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <ol class="mt-2 space-y-3 border-l border-edge pl-3" aria-label="Intermediate stops">
                        <li v-for="(stopover, stopIndex) in step.intermediateStops" :key="stopIndex" class="flex items-start justify-between gap-3">
                            <span class="min-w-0 leading-relaxed wrap-anywhere">
                                <span :class="stopover.cancelled === true && 'line-through'">{{ stopover.stop?.name }}</span>
                                <span v-if="stopover.cancelled === true" class="mt-0.5 block text-red-700 dark:text-red-300">Cancelled</span>
                            </span>
                            <span class="shrink-0 text-muted tabular-nums">{{ formatTime(stopoverTiming(stopover).actual || stopoverTiming(stopover).planned) }}</span>
                        </li>
                    </ol>
                </details>
            </template>
            <p v-if="leg.cancelled" class="mt-3 flex items-start gap-2 text-xs font-medium text-red-700 dark:text-red-300">
                <AppIcon name="alert" class="size-4 shrink-0" />
                This section is cancelled.
            </p>
        </div>

        <div class="col-start-1 pt-0.5 text-right tabular-nums">
            <p class="font-medium">{{ formatTime(leg.arrival || leg.plannedArrival) }}</p>
            <s v-if="Math.abs(arrivalDelay) >= 60" class="mt-0.5 block text-xs text-muted">
                {{ formatTime(leg.plannedArrival) }}
            </s>
        </div>
        <div class="relative" aria-hidden="true">
            <span class="absolute top-0 left-1.5 h-2.5 w-1 bg-(--route-color)"></span>
            <span class="absolute top-0.75 left-0.25 size-3.5 rounded-full border-3 border-(--route-color) bg-panel"></span>
        </div>
        <div class="min-w-0" data-journey-destination>
            <p class="font-semibold leading-5 wrap-anywhere">{{ leg.destination?.name || leg.destination?.address }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span v-if="!walking">Get off here</span>
                <span v-if="arrivalPlatform != null" class="inline-flex items-center gap-1">
                    <AppIcon name="platform" class="size-3.5" />
                    Platform {{ arrivalPlatform }}
                </span>
                <span v-if="platformChanged(leg.arrivalPlatform, leg.plannedArrivalPlatform)" class="text-amber-800 dark:text-amber-300">
                    was {{ leg.plannedArrivalPlatform }}
                </span>
            </p>
        </div>
    </div>
</template>

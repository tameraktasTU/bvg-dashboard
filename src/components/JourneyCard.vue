<script setup>
import { computed } from 'vue';
import { formatTime, journeySummary } from '../lib/transit.js';
import { buildJourneyDetails } from '../lib/journeyDetails.js';
import AppIcon from './AppIcon.vue';
import LineBadge from './LineBadge.vue';
import JourneyLeg from './JourneyLeg.vue';

const props = defineProps({
    journey: { type: Object, required: true },
    index: { type: Number, required: true },
    expanded: { type: Boolean, default: false }
});
defineEmits(['toggle']);
const summary = computed(() => journeySummary(props.journey));
const details = computed(() => buildJourneyDetails(props.journey));
const rideCount = computed(() => details.value.steps.filter((step) => step.type === 'ride').length);
const distanceFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const formatDuration = (minutes) => {
    if (!Number.isFinite(minutes)) return '—';
    const seconds = Math.round(Math.abs(minutes) * 60);
    const wholeMinutes = Math.floor(seconds / 60);
    if (seconds === 0) return '0 min';
    if (seconds < 60) return `${seconds} sec`;
    if (seconds % 60) return `${wholeMinutes} min ${seconds % 60} sec`;
    if (wholeMinutes >= 60) return `${Math.floor(wholeMinutes / 60)} h ${wholeMinutes % 60} min`;
    return `${wholeMinutes} min`;
};
const formatDistance = (meters) => Number.isFinite(meters) && meters >= 0
    ? meters >= 1000 ? `${distanceFormatter.format(meters / 1000)} km` : `${Math.round(meters)} m`
    : '—';
const platform = (leg, type) => leg[`${type}Platform`] ?? leg[`planned${type[0].toUpperCase()}${type.slice(1)}Platform`];
</script>

<template>
    <article class="overflow-hidden rounded-2xl border bg-panel transition-colors"
        :class="expanded ? 'border-ink/50' : 'border-edge'">
        <button type="button" class="group w-full p-5 text-left sm:p-6" :aria-expanded="expanded"
            :aria-controls="`journey-detail-${index}`"
            :aria-label="`View journey ${index + 1} details, ${summary.duration}`" @click="$emit('toggle')">
            <span class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-3 text-2xl tracking-tight tabular-nums">
                    <span>{{ formatTime(summary.departure) }}</span>
                    <AppIcon name="arrow" class="size-5 text-muted" />
                    <span>{{ formatTime(summary.arrival) }}</span>
                </span>
                <span class="text-right text-sm tabular-nums">{{ summary.duration }}</span>
            </span>
            <span v-if="summary.cancelled" class="mt-2 block text-xs font-medium text-red-700 dark:text-red-300">
                Connection cancelled
            </span>
            <span v-else-if="
                Math.abs(summary.departureDelay) >= 60 || Math.abs(summary.arrivalDelay) >= 60
            " class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
                <span v-if="Math.abs(summary.departureDelay) >= 60">
                    Departure planned
                    <s>{{ formatTime(summary.plannedDeparture) }}</s>
                </span>
                <span v-if="Math.abs(summary.arrivalDelay) >= 60">
                    Arrival planned
                    <s>{{ formatTime(summary.plannedArrival) }}</s>
                </span>
            </span>
            <span class="mt-4 flex items-center justify-between gap-3">
                <span class="flex flex-wrap items-center gap-1.5">
                    <template v-for="(leg, legIndex) in journey.legs" :key="legIndex">
                        <AppIcon v-if="leg.walking" name="walk" class="mx-1 size-4 text-muted" />
                        <LineBadge v-else-if="leg.line" :line="leg.line" />
                        <AppIcon v-if="legIndex < journey.legs.length - 1" name="chevron" class="size-3 text-muted" />
                    </template>
                </span>
                <span class="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span>
                        {{
                            summary.transfers
                                ? `${summary.transfers} ${summary.transfers === 1 ? 'transfer' : 'transfers'}`
                                : 'Direct'
                        }}
                    </span>
                    <AppIcon name="down" class="size-4 transition-transform" :class="expanded && 'rotate-180'" />
                </span>
            </span>
        </button>

        <Transition name="journey-detail">
            <div
                v-if="expanded"
                :id="`journey-detail-${index}`"
                data-journey-details
                role="region"
                :aria-label="`Journey ${index + 1} details`"
                class="border-t border-edge px-4 py-5 sm:px-6 sm:py-6"
            >
                <div class="mb-6 flex flex-wrap items-center justify-between gap-2">
                    <h3 class="text-sm font-semibold">Your route</h3>
                    <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span v-if="rideCount">{{ rideCount }} {{ rideCount === 1 ? 'ride' : 'rides' }}</span>
                        <span v-else>Walking route</span>
                        <span v-if="details.walkingMinutes > 0" class="inline-flex items-center gap-1.5">
                            <AppIcon name="walk" class="size-3.5" />
                            {{ formatDuration(details.walkingMinutes) }} on foot
                        </span>
                    </p>
                </div>
                <ol class="space-y-5" aria-label="Journey itinerary">
                    <li v-for="(step, stepIndex) in details.steps" :key="stepIndex" :data-journey-step="step.type">
                        <div
                            v-if="step.type === 'transfer'"
                            data-journey-transfer
                            class="rounded-xl bg-well p-3.5 sm:p-4"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <p class="flex items-start gap-2 text-sm font-semibold">
                                        <AppIcon name="transfer" class="mt-0.5 size-4 shrink-0" />
                                        <span class="wrap-anywhere">Change at {{ step.previousLeg.destination?.name }}</span>
                                    </p>
                                    <div class="mt-2.5 flex flex-wrap items-center gap-2 pl-6" aria-label="Change lines">
                                        <LineBadge :line="step.previousLeg.line" />
                                        <AppIcon name="arrow" class="size-3.5 text-muted" />
                                        <LineBadge :line="step.nextLeg.line" />
                                    </div>
                                </div>
                                <div v-if="step.minutes != null && step.minutes >= 0" class="shrink-0 text-right tabular-nums">
                                    <p class="text-lg font-medium tracking-tight">{{ formatDuration(step.minutes) }}</p>
                                    <p class="mt-0.5 text-xs text-muted">to transfer</p>
                                </div>
                            </div>
                            <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                <p v-if="step.walkingLegs.length" class="flex flex-wrap items-center gap-1.5">
                                    <AppIcon name="walk" class="size-4 text-muted" />
                                    <span>Walk {{ formatDuration(step.walkingMinutes) }}</span>
                                    <span v-if="step.distance != null" class="text-muted">· {{ formatDistance(step.distance) }}</span>
                                </p>
                                <p v-if="step.waitMinutes != null && step.waitMinutes >= 0" class="flex items-center gap-1.5">
                                    <AppIcon name="clock" class="size-4 text-muted" />
                                    Wait {{ formatDuration(step.waitMinutes) }}
                                </p>
                            </div>
                            <p
                                v-if="platform(step.previousLeg, 'arrival') != null || platform(step.nextLeg, 'departure') != null"
                                class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-edge pt-3 text-xs text-muted"
                            >
                                <AppIcon name="platform" class="size-4" />
                                <span v-if="platform(step.previousLeg, 'arrival') != null && platform(step.nextLeg, 'departure') == null">Arrive at</span>
                                <span v-if="platform(step.previousLeg, 'arrival') == null && platform(step.nextLeg, 'departure') != null">Board at</span>
                                <span v-if="platform(step.previousLeg, 'arrival') != null">Platform {{ platform(step.previousLeg, 'arrival') }}</span>
                                <AppIcon v-if="platform(step.previousLeg, 'arrival') != null && platform(step.nextLeg, 'departure') != null" name="arrow" class="size-3.5" />
                                <span v-if="platform(step.nextLeg, 'departure') != null">Platform {{ platform(step.nextLeg, 'departure') }}</span>
                            </p>
                            <template v-for="(walk, walkIndex) in step.walkingLegs" :key="walkIndex">
                                <p v-if="walk.origin?.name !== walk.destination?.name" class="mt-3 text-xs leading-relaxed text-muted wrap-anywhere">
                                    Walk to {{ walk.destination?.name }}
                                </p>
                            </template>
                            <p v-if="step.missed" class="mt-3 flex items-start gap-2 text-xs font-medium text-red-700 dark:text-red-300">
                                <AppIcon name="alert" class="size-4 shrink-0" />
                                <span v-if="step.nextLeg.reachable === false">Connection not reachable. Check another journey.</span>
                                <span v-else>Transfer time is too short. Check another journey.</span>
                            </p>
                        </div>
                        <JourneyLeg v-else :step="step" :format-duration="formatDuration" :format-distance="formatDistance" />
                    </li>
                </ol>
            </div>
        </Transition>
    </article>
</template>

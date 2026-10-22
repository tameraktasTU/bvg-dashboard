<script setup>
import { computed } from 'vue';
import { formatTime, journeySummary, timestamp } from '../lib/transit.js';
import AppIcon from './AppIcon.vue';
import LineBadge from './LineBadge.vue';

const props = defineProps({
    journey: { type: Object, required: true },
    index: { type: Number, required: true },
    expanded: { type: Boolean, default: false }
});
defineEmits(['toggle']);
const summary = computed(() => journeySummary(props.journey));
const duration = (leg) =>
    Math.max(
        0,
        Math.round(
            (timestamp(leg.arrival || leg.plannedArrival) -
                timestamp(leg.departure || leg.plannedDeparture)) /
            60000
        )
    );
const transferTime = (index) => {
    const previous = props.journey.legs[index - 1];
    const next = props.journey.legs[index + 1];
    if (!previous || !next) return null;
    const minutes = Math.round(
        (timestamp(next.departure || next.plannedDeparture) -
            timestamp(previous.arrival || previous.plannedArrival)) /
        60000
    );
    return Number.isFinite(minutes) ? Math.max(0, minutes) : null;
};
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

        <div v-if="expanded" :id="`journey-detail-${index}`" class="border-t border-edge px-5 py-6 sm:px-6">
            <ol class="space-y-6">
                <li v-for="(leg, legIndex) in journey.legs" :key="legIndex"
                    class="relative grid grid-cols-[3rem_1fr] gap-3 text-sm">
                    <div class="text-right text-xs tabular-nums">
                        {{ formatTime(leg.departure || leg.plannedDeparture) }}
                        <span v-if="Math.abs(leg.departureDelay) >= 60" class="mt-1 block text-muted line-through">
                            {{ formatTime(leg.plannedDeparture) }}
                        </span>
                    </div>
                    <div class="min-w-0 border-l-2 border-edge pl-5">
                        <p class="font-medium">{{ leg.origin?.name || leg.origin?.address }}</p>
                        <div v-if="leg.walking" class="my-3 flex flex-wrap items-center gap-2 text-muted">
                            <AppIcon name="walk" class="size-4" />
                            <span>Walk {{ duration(leg) }} min</span>
                            <span v-if="transferTime(legIndex) !== null" class="text-xs">
                                · {{ transferTime(legIndex) }} min to transfer
                            </span>
                        </div>
                        <div v-else class="my-3 space-y-2">
                            <div class="flex flex-wrap items-center gap-2">
                                <LineBadge :line="leg.line" />
                                <span class="text-xs text-muted">
                                    towards {{ leg.direction || leg.destination?.name }}
                                </span>
                            </div>
                            <p class="text-xs text-muted">
                                {{ duration(leg) }} min
                                <span v-if="leg.stopovers?.length">
                                    · {{ Math.max(0, leg.stopovers.length - 1) }} stops
                                </span>
                                <span v-if="leg.departurePlatform || leg.plannedDeparturePlatform">
                                    · Platform
                                    {{ leg.departurePlatform || leg.plannedDeparturePlatform }}
                                </span>
                            </p>
                        </div>
                        <p class="flex flex-wrap items-baseline justify-between gap-2 font-medium">
                            <span>{{ leg.destination?.name || leg.destination?.address }}</span>
                            <span class="shrink-0 text-xs font-normal tabular-nums">
                                <s v-if="Math.abs(leg.arrivalDelay) >= 60" class="mr-1 text-muted">
                                    {{ formatTime(leg.plannedArrival) }}
                                </s>
                                {{ formatTime(leg.arrival || leg.plannedArrival) }}
                            </span>
                        </p>
                    </div>
                </li>
            </ol>
        </div>
    </article>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { formatTime, stopoverTiming } from '../lib/transit.js';
import AppIcon from './AppIcon.vue';
import LineBadge from './LineBadge.vue';

const props = defineProps({
    trip: { type: Object, required: true },
    currentIndex: { type: Number, default: -1 }
});
const emit = defineEmits(['close']);
const dialog = ref(null);
const content = ref(null);

watch(
    () => props.trip.open,
    async (open) => {
        await nextTick();
        if (open && !dialog.value.open) dialog.value.showModal();
        else if (!open && dialog.value.open) dialog.value.close();
    }
);

watch(
    () => props.trip.loading,
    async (loading) => {
        if (loading) return;
        await nextTick();
        const scroller = content.value;
        const row = scroller?.querySelector('[data-current-stop]');
        if (!row || !scroller) return;
        scroller.scrollTo({
            top:
                scroller.scrollTop +
                row.getBoundingClientRect().top -
                scroller.getBoundingClientRect().top -
                (scroller.clientHeight - row.offsetHeight) / 2,
            behavior: 'instant'
        });
    }
);
</script>

<template>
    <dialog
        ref="dialog"
        aria-labelledby="trip-title"
        class="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-edge bg-panel p-0 text-ink open:flex open:flex-col"
        @close="emit('close')"
        @cancel.prevent="emit('close')"
        @click="$event.target === dialog && emit('close')"
    >
        <div class="flex shrink-0 items-center gap-3 border-b border-edge p-5">
            <LineBadge v-if="trip.departure?.line" :line="trip.departure.line" />
            <div class="min-w-0 flex-1">
                <h2 id="trip-title" class="text-base font-semibold">Line overview</h2>
                <p class="truncate text-xs text-muted">{{ trip.departure?.direction }}</p>
            </div>
            <button
                type="button"
                class="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-well"
                aria-label="Close line overview"
                @click="emit('close')"
            >
                <AppIcon name="close" class="size-5" />
            </button>
        </div>
        <div ref="content" class="min-h-0 max-h-[65dvh] overflow-y-auto overscroll-contain p-5">
            <p
                v-if="trip.loading"
                role="status"
                class="flex items-center gap-3 py-8 text-sm text-muted"
            >
                <AppIcon name="refresh" class="size-4 animate-spin" />
                Loading route…
            </p>
            <p
                v-else-if="trip.error"
                role="alert"
                class="py-6 text-sm text-red-700 dark:text-red-300"
            >
                {{ trip.error }}
            </p>
            <p v-else-if="!trip.stopovers.length" class="py-6 text-sm text-muted">
                Stopover information is unavailable for this trip.
            </p>
            <ol v-else class="space-y-0" aria-label="Stops on this route">
                <li
                    v-for="(stopover, index) in trip.stopovers"
                    :key="index"
                    class="relative py-4 pr-2 pl-8"
                    :data-current-stop="index === currentIndex ? '' : undefined"
                    :aria-current="index === currentIndex ? 'location' : undefined"
                >
                    <span
                        v-if="index > 0"
                        data-stop-connector="before"
                        class="absolute top-0 left-1.75 h-6.5 w-0.5"
                        :class="index <= currentIndex ? 'bg-muted/40' : 'bg-ink/70'"
                        aria-hidden="true"
                    ></span>
                    <span
                        v-if="index < trip.stopovers.length - 1"
                        data-stop-connector="after"
                        class="absolute top-6.5 bottom-0 left-1.75 w-0.5"
                        :class="index < currentIndex ? 'bg-muted/40' : 'bg-ink/70'"
                        aria-hidden="true"
                    ></span>
                    <span
                        data-stop-marker
                        class="absolute top-4.5 left-0 grid size-4 place-items-center"
                        aria-hidden="true"
                    >
                        <span
                            class="rounded-full border-2"
                            :class="
                                index === currentIndex
                                    ? 'size-3.5 border-ink bg-signal'
                                    : index < currentIndex
                                      ? 'size-2.5 border-muted/55 bg-panel'
                                      : 'size-2.5 border-ink/70 bg-panel'
                            "
                        ></span>
                    </span>
                    <div
                        class="flex items-start justify-between gap-4"
                        :class="index < currentIndex && 'text-muted'"
                    >
                        <div class="min-w-0">
                            <p class="text-sm" :class="index === currentIndex && 'font-semibold'">
                                {{ stopover.stop?.name }}
                            </p>
                            <p v-if="index === currentIndex" class="mt-1 text-xs text-muted">
                                Your selected stop
                            </p>
                            <p
                                v-if="stopoverTiming(stopover).platform"
                                class="mt-1 text-xs text-muted"
                            >
                                Platform {{ stopoverTiming(stopover).platform }}
                            </p>
                            <p
                                v-if="stopover.cancelled"
                                class="mt-1 text-xs text-red-700 dark:text-red-300"
                            >
                                Cancelled
                            </p>
                        </div>
                        <div class="shrink-0 text-right text-sm tabular-nums">
                            <p>
                                {{
                                    formatTime(
                                        stopoverTiming(stopover).actual ||
                                            stopoverTiming(stopover).planned
                                    )
                                }}
                            </p>
                            <s
                                v-if="Math.abs(stopoverTiming(stopover).delay) >= 60"
                                class="text-xs text-muted"
                            >
                                {{ formatTime(stopoverTiming(stopover).planned) }}
                            </s>
                        </div>
                    </div>
                </li>
            </ol>
        </div>
    </dialog>
</template>

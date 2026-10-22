<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
    id: { type: String, required: true },
    label: { type: String, required: true },
    placeholder: { type: String, default: 'Search a station…' },
    search: { type: Object, required: true },
    nearby: { type: Boolean, default: false },
    marker: { type: String, default: 'circle' }
});

const emit = defineEmits(['search', 'select', 'nearby', 'close']);
const active = ref(-1);
const root = ref(null);
const input = ref(null);
const list = ref(null);
const editing = ref(false);
const draft = ref('');
let blurTimer;
const expanded = computed(() => props.search.open);

watch(
    [() => props.search.results, expanded],
    () => {
        active.value = -1;
    }
);
watch(active, (index) => {
    const option = list.value?.children[index];
    const scroller = list.value?.parentElement;
    if (!expanded.value || !option || !scroller) return;
    const bounds = option.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    if (bounds.top < viewport.top) scroller.scrollTop -= viewport.top - bounds.top;
    else if (bounds.bottom > viewport.bottom) scroller.scrollTop += bounds.bottom - viewport.bottom;
}, { flush: 'post' });
onBeforeUnmount(() => clearTimeout(blurTimer));

function select(location) {
    editing.value = false;
    emit('select', location);
    input.value?.blur();
}

function onKeydown(event) {
    const count = props.search.results.length;
    if (event.key === 'Escape') {
        editing.value = false;
        emit('close');
    } else if (expanded.value && count && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const down = event.key === 'ArrowDown';
        active.value = active.value < 0
            ? (down ? 0 : count - 1)
            : (active.value + (down ? 1 : -1) + count) % count;
    } else if (event.key === 'Enter' && expanded.value) {
        event.preventDefault();
        if (count && !props.search.loading && !props.search.error)
            select(props.search.results[Math.max(0, active.value)]);
    } else if (event.key === 'Enter') {
        editing.value = false;
    }
}

function onBlur(event) {
    if (root.value?.contains(event.relatedTarget)) return;
    editing.value = false;
    blurTimer = setTimeout(() => emit('close'), 150);
}

function onFocus() {
    clearTimeout(blurTimer);
    if (editing.value) return;
    editing.value = true;
    draft.value = '';
    emit('close');
}

function onInput(event) {
    draft.value = event.target.value;
    emit('search', draft.value);
}

function findNearby() {
    clearTimeout(blurTimer);
    input.value?.focus();
    emit('nearby');
}
</script>

<template>
    <div ref="root" class="relative min-w-0" @focusout="onBlur">
        <label :for="id" class="mb-2 block text-sm font-medium">{{ label }}</label>
        <div
            class="flex min-h-13 items-center gap-3 rounded-xl border border-edge bg-panel px-4 transition-colors focus-within:border-ink">
            <span class="size-3 shrink-0 border-2 border-ink"
                :class="marker === 'square' ? 'rounded-xs bg-signal' : 'rounded-full'" aria-hidden="true"></span>
            <input :id="id" ref="input" type="text" role="combobox" autocomplete="off" :aria-expanded="expanded"
                :aria-controls="expanded ? `${id}-results` : undefined"
                :aria-activedescendant="expanded && active >= 0 ? `${id}-option-${active}` : undefined" aria-autocomplete="list"
                :placeholder="placeholder" :value="editing ? draft : search.query"
                class="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-none"
                @input="onInput" @keydown="onKeydown" @focus="onFocus" @click="onFocus" />
            <button v-if="nearby" type="button"
                class="-mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-well hover:text-ink"
                :aria-label="`Use my location for ${label.toLowerCase()}`" title="Use my location" @pointerdown.prevent
                @click="findNearby">
                <AppIcon name="location" class="size-4.5" />
            </button>
        </div>

        <Transition name="switch">
            <div v-if="expanded"
                class="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-edge bg-panel p-1.5 shadow-xl shadow-black/8">
                <p v-if="search.loading" class="flex items-center gap-2 p-3 text-sm text-muted" role="status">
                    <AppIcon name="refresh" class="size-4 animate-spin" />
                    Finding stops…
                </p>
                <p v-else-if="search.error" class="p-3 text-sm text-red-700 dark:text-red-300" role="alert">
                    {{ search.error }}
                </p>
                <p v-else-if="!search.results.length" class="p-3 text-sm text-muted">
                    No stations found. Try another name.
                </p>
                <ul :id="`${id}-results`" ref="list" role="listbox" :aria-label="`${label} suggestions`">
                    <li v-for="(location, index) in search.results" :id="`${id}-option-${index}`"
                        :key="location.id" role="option"
                        :aria-selected="active === index">
                        <button type="button" tabindex="-1"
                            class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors hover:bg-well"
                            :class="active === index && 'bg-well'" @pointerdown.prevent @click="select(location)">
                            <AppIcon name="departures" class="size-4 shrink-0 text-muted" />
                            <span class="min-w-0 flex-1 wrap-anywhere">
                                <span class="block">{{ location.name }}</span>
                                <span class="mt-0.5 block text-xs text-muted">Station</span>
                            </span>
                            <span v-if="Number.isFinite(location.distance) && location.distance >= 0"
                                class="shrink-0 text-xs text-muted tabular-nums">
                                {{ Math.round(location.distance) }} m
                            </span>
                        </button>
                    </li>
                </ul>
            </div>
        </Transition>
    </div>
</template>

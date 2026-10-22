<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
    id: { type: String, required: true },
    modelValue: { type: String, required: true }
});
const emit = defineEmits(['update:modelValue']);
const root = ref(null);
const input = ref(null);
const hourSelect = ref(null);
const panel = ref(null);
const open = ref(false);
const above = ref(false);
const availableSpace = ref(320);
const hour = ref('00');
const minute = ref('00');
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const pickerId = computed(() => `${props.id}-picker`);

watch(
    () => props.modelValue,
    (value) => {
        if (open.value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
            [hour.value, minute.value] = value.split(':');
        }
    }
);

async function showPicker(focusPicker = false) {
    if (!open.value) {
        const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(props.modelValue);
        [hour.value, minute.value] = valid ? props.modelValue.split(':') : ['00', '00'];
        open.value = true;
    }
    await nextTick();
    positionPicker();
    if (focusPicker) {
        hourSelect.value?.focus();
    }
}

function positionPicker() {
    if (!open.value || !panel.value) return;
    const bounds = root.value.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    let bottom = top + (viewport?.height || window.innerHeight);
    const navigation = document.querySelector('nav[aria-label="Mobile navigation"]');
    if (navigation?.getClientRects().length) {
        bottom = Math.min(bottom, navigation.getBoundingClientRect().top - 8);
    }
    const belowSpace = Math.max(0, bottom - bounds.bottom - 16);
    const aboveSpace = Math.max(0, bounds.top - top - 16);
    const height = panel.value.scrollHeight + 2;
    above.value = height > belowSpace && aboveSpace > belowSpace;
    availableSpace.value = Math.floor(above.value ? aboveSpace : belowSpace);
}

function closePicker(restoreFocus = false) {
    open.value = false;
    if (restoreFocus) input.value?.focus();
}

function applyTime() {
    emit('update:modelValue', `${hour.value}:${minute.value}`);
    closePicker(true);
}

function onKeydown(event) {
    if (event.key === 'Escape' && open.value) {
        event.preventDefault();
        event.stopPropagation();
        closePicker(true);
    } else if (event.key === 'ArrowDown' && event.target === input.value) {
        event.preventDefault();
        showPicker(true);
    } else if (event.key === 'Enter' && open.value && event.target.tagName === 'SELECT') {
        event.preventDefault();
        event.stopPropagation();
        applyTime();
    }
}

function onOutsidePointer(event) {
    if (!root.value?.contains(event.target)) closePicker();
}

function onFocusOut(event) {
    if (!root.value?.contains(event.relatedTarget)) closePicker();
}

onMounted(() => {
    document.addEventListener('pointerdown', onOutsidePointer);
    document.addEventListener('scroll', positionPicker, true);
    window.addEventListener('resize', positionPicker);
    window.visualViewport?.addEventListener('resize', positionPicker);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onOutsidePointer);
    document.removeEventListener('scroll', positionPicker, true);
    window.removeEventListener('resize', positionPicker);
    window.visualViewport?.removeEventListener('resize', positionPicker);
});
</script>

<template>
    <div ref="root" class="relative min-w-0" @keydown="onKeydown" @focusout="onFocusOut">
        <div class="relative flex h-11 items-center rounded-xl border border-edge bg-panel focus-within:border-ink">
            <input
                :id="id"
                ref="input"
                :value="modelValue"
                type="text"
                inputmode="text"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                placeholder="HH:MM"
                title="24-hour time (HH:MM)"
                maxlength="5"
                autocomplete="off"
                required
                aria-haspopup="dialog"
                :aria-expanded="open"
                :aria-controls="open ? pickerId : undefined"
                class="h-full min-w-0 w-full rounded-xl bg-transparent pl-3 pr-9 text-sm tabular-nums"
                @input="emit('update:modelValue', $event.target.value)"
                @click="showPicker()"
            />
            <button
                type="button"
                aria-label="Choose journey time"
                title="Choose journey time"
                aria-haspopup="dialog"
                :aria-expanded="open"
                :aria-controls="open ? pickerId : undefined"
                class="absolute right-0 grid h-full w-9 place-items-center rounded-xl text-muted hover:text-ink"
                @click="showPicker(true)"
            >
                <AppIcon name="clock" class="size-4" />
            </button>
        </div>
        <div
            v-if="open"
            :id="pickerId"
            ref="panel"
            role="dialog"
            :aria-labelledby="`${pickerId}-title`"
            class="absolute right-0 z-50 w-56 overflow-y-auto rounded-xl border border-edge bg-panel p-4 shadow-xl shadow-black/8"
            :class="above ? 'bottom-full mb-2' : 'top-full mt-2'"
            :style="{ maxHeight: `${availableSpace}px` }"
        >
            <div class="mb-4 flex items-center justify-between gap-3">
                <p :id="`${pickerId}-title`" class="text-sm font-medium">24-hour time</p>
                <button
                    type="button"
                    aria-label="Close time picker"
                    class="-mr-2 grid size-8 place-items-center rounded-lg text-muted hover:bg-well hover:text-ink"
                    @click="closePicker(true)"
                >
                    <AppIcon name="close" class="size-4" />
                </button>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <label class="min-w-0 text-xs text-muted">
                    Hours
                    <select
                        ref="hourSelect"
                        v-model="hour"
                        class="mt-2 h-11 w-full rounded-lg border border-edge bg-well px-3 text-base text-ink tabular-nums"
                    >
                        <option v-for="value in hours" :key="value" :value="value">{{ value }}</option>
                    </select>
                </label>
                <label class="min-w-0 text-xs text-muted">
                    Minutes
                    <select
                        v-model="minute"
                        class="mt-2 h-11 w-full rounded-lg border border-edge bg-well px-3 text-base text-ink tabular-nums"
                    >
                        <option v-for="value in minutes" :key="value" :value="value">{{ value }}</option>
                    </select>
                </label>
            </div>
            <button
                type="button"
                class="mt-4 h-10 w-full rounded-lg bg-ink text-sm font-medium text-panel hover:opacity-85"
                @click="applyTime"
            >
                Set time
            </button>
        </div>
    </div>
</template>

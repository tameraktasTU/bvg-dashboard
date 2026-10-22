<script setup>
import { computed, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
    id: { type: String, required: true },
    modelValue: { type: String, required: true }
});
const emit = defineEmits(['update:modelValue']);
const textInput = ref(null);
const picker = ref(null);
const draft = computed(() => props.modelValue.split('-').reverse().join('.'));

function validDate(value) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
    if (!match) return false;
    const [, day, month, year] = match;
    const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
    return (
        Number(year) > 0 &&
        Number.isFinite(date.getTime()) &&
        date.getUTCDate() === Number(day) &&
        date.getUTCMonth() + 1 === Number(month)
    );
}

watch(
    () => props.modelValue,
    () =>
        textInput.value?.setCustomValidity(
            validDate(draft.value) ? '' : 'Enter a valid date as DD.MM.YYYY.'
        )
);

function onInput(event) {
    const value = event.target.value;
    event.target.setCustomValidity(validDate(value) ? '' : 'Enter a valid date as DD.MM.YYYY.');
    emit('update:modelValue', value.split('.').reverse().join('-'));
}

function selectDate(event) {
    if (event.target.value) emit('update:modelValue', event.target.value);
}
</script>

<template>
    <div
        class="relative flex h-11 min-w-0 items-center rounded-xl border border-edge bg-panel focus-within:border-ink"
    >
        <input
            :id="id"
            ref="textInput"
            :value="draft"
            type="text"
            inputmode="text"
            pattern="[0-9]{2}\.[0-9]{2}\.[0-9]{4}"
            placeholder="TT.MM.JJJJ"
            title="Date (DD.MM.YYYY)"
            maxlength="10"
            autocomplete="off"
            required
            class="h-full min-w-0 w-full rounded-xl bg-transparent pl-3 pr-10 text-sm tabular-nums"
            @input="onInput"
        />
        <input
            ref="picker"
            :value="validDate(draft) ? modelValue : ''"
            type="date"
            tabindex="-1"
            aria-hidden="true"
            class="pointer-events-none absolute bottom-0 left-0 size-0 opacity-0"
            @change="selectDate"
        />
        <button
            type="button"
            aria-label="Choose journey date"
            title="Choose journey date"
            class="absolute right-0 grid h-full w-10 place-items-center rounded-xl text-muted hover:text-ink"
            @click="picker.showPicker ? picker.showPicker() : picker.click()"
        >
            <AppIcon name="calendar" class="size-4" />
        </button>
    </div>
</template>

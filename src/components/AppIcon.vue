<script setup>
import {
    IconArrowRight,
    IconArrowsExchange,
    IconAlertTriangle,
    IconArrowsDownUp,
    IconCalendarEvent,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconCurrentLocation,
    IconExternalLink,
    IconInfoCircle,
    IconLayoutColumns,
    IconMoon,
    IconRadar,
    IconRefresh,
    IconRoute,
    IconSearch,
    IconSettings,
    IconSun,
    IconTrain,
    IconWalk,
    IconX
} from '@tabler/icons-vue';

defineProps({
    name: { type: String, required: true }
});

const icons = {
    transfer: IconArrowsExchange,
    alert: IconAlertTriangle,
    platform: IconLayoutColumns,
    arrow: IconArrowRight,
    chevron: IconChevronRight,
    down: IconChevronDown,
    search: IconSearch,
    location: IconCurrentLocation,
    swap: IconArrowsDownUp,
    clock: IconClock,
    calendar: IconCalendarEvent,
    refresh: IconRefresh,
    route: IconRoute,
    departures: IconTrain,
    settings: IconSettings,
    radar: IconRadar,
    sun: IconSun,
    moon: IconMoon,
    close: IconX,
    walk: IconWalk,
    check: IconCheck,
    info: IconInfoCircle,
    external: IconExternalLink
};
</script>

<template>
    <component :is="icons[name]" :stroke="1.6" aria-hidden="true" />
</template>

<script setup>
import { getLineClasses } from '../lib/transit.js';

defineProps({ line: { type: Object, default: () => ({}) } });
</script>

<template>
    <span
        class="inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md px-2 text-xs font-semibold whitespace-nowrap"
        :class="getLineClasses(line)">
        {{ line.name || line.id || 'Transit' }}
    </span>
</template>

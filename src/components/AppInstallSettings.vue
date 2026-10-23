<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
    installed: { type: Boolean, default: false },
    canInstall: { type: Boolean, default: false },
    installing: { type: Boolean, default: false },
    error: { type: String, default: '' },
    platform: { type: String, default: 'desktop' }
});
const emit = defineEmits(['install']);
const instructionsOpen = ref(false);

watch(() => props.error, (error) => {
    if (error) instructionsOpen.value = true;
});

function install() {
    if (props.canInstall) emit('install');
    else instructionsOpen.value = !instructionsOpen.value;
}
</script>

<template>
    <div class="grid gap-5 border-b border-edge pb-8 md:grid-cols-12">
        <div class="md:col-span-5">
            <h2 class="text-base font-semibold">Install app</h2>
            <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted">
                Your next connection, one tap away.
                Keep the dashboard on your Home Screen or in your app launcher.
            </p>
        </div>
        <div class="min-w-0 rounded-2xl bg-well p-5 sm:p-6 md:col-span-7">
            <div class="flex items-center gap-3">
                <img src="/icons/app-192.png" alt="" width="48" height="48" class="size-12 shrink-0" />
                <div class="min-w-0">
                    <p class="text-sm font-medium">BVG Dashboard</p>
                    <p class="mt-1 text-xs text-muted">Berlin & Brandenburg</p>
                </div>
            </div>
            <p v-if="installed" role="status" class="mt-5 flex items-start gap-2 text-sm">
                <AppIcon name="check" class="mt-0.5 size-4 shrink-0" />
                <span>App installed. Open it from your Home Screen or app launcher.</span>
            </p>
            <template v-else>
                <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                    <button type="button" :disabled="installing"
                        :aria-expanded="!canInstall && !installing ? instructionsOpen : undefined"
                        :aria-controls="!canInstall && !installing ? 'app-install-instructions' : undefined"
                        class="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-medium text-panel transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-65"
                        @click="install">
                        {{ installing ? 'Opening installer…' : canInstall ? 'Install app' : platform === 'ios' ? 'Add to Home Screen' : 'Installation instructions' }}
                    </button>
                    <button v-if="canInstall" type="button" :aria-expanded="instructionsOpen"
                        aria-controls="app-install-instructions"
                        class="min-h-11 rounded-sm text-sm text-muted hover:text-ink"
                        @click="instructionsOpen = !instructionsOpen">
                        Other ways to install
                    </button>
                </div>
                <p v-if="error" role="alert" class="mt-4 text-sm text-red-700 dark:text-red-300">{{ error }}</p>
                <div v-show="instructionsOpen" id="app-install-instructions"
                    class="mt-5 rounded-xl bg-panel p-4 text-sm leading-relaxed">
                    <template v-if="platform === 'ios'">
                        <h3 class="font-medium">On iPhone or iPad</h3>
                        <ol class="mt-3 list-decimal space-y-2 pl-5">
                            <li>Open this website in Safari.</li>
                            <li>Open the Share menu and choose <strong class="font-medium">Add to Home Screen</strong>.</li>
                            <li>Keep <strong class="font-medium">Open as Web App</strong> enabled if shown, then tap <strong class="font-medium">Add</strong>.</li>
                        </ol>
                        <p class="mt-3 text-xs text-muted">If the option is missing, scroll down in the Share menu and tap Edit Actions.</p>
                    </template>
                    <template v-else-if="platform === 'android'">
                        <h3 class="font-medium">On Android</h3>
                        <ol class="mt-3 list-decimal space-y-2 pl-5">
                            <li>Open this website in Chrome or another browser that supports app installation.</li>
                            <li>Open the browser menu and choose <strong class="font-medium">Install app</strong> or <strong class="font-medium">Add to Home screen</strong>.</li>
                            <li>Follow the browser instructions to add the dashboard.</li>
                        </ol>
                    </template>
                    <template v-else>
                        <h3 class="font-medium">From your browser</h3>
                        <p class="mt-3">In Chrome or Edge, use the install icon in the address bar or the browser menu’s install option.</p>
                        <p class="mt-3">In Safari on Mac, choose <strong class="font-medium">File → Add to Dock</strong>.</p>
                        <p class="mt-3 text-xs text-muted">Available options depend on your browser. If installation is unavailable, bookmark the dashboard or open it in another browser.</p>
                    </template>
                </div>
            </template>
            <p class="mt-4 text-xs leading-relaxed text-muted">Live departures, journey planning and maps need an internet connection.</p>
        </div>
    </div>
</template>

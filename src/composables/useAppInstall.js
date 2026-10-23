import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue';

const DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

export const useAppInstall = ({
    window: browser = globalThis.window,
    navigator: device = globalThis.navigator
} = {}) => {
    const deferredPrompt = shallowRef(null);
    const installed = ref(false);
    const installing = ref(false);
    const error = ref('');
    const mediaQueries = browser?.matchMedia
        ? DISPLAY_MODES.map((mode) => browser.matchMedia(`(display-mode: ${mode})`))
        : [];
    let installedThisSession = false;

    const installPlatform = computed(() => {
        const userAgent = device?.userAgent || '';
        if (/iPad|iPhone|iPod/i.test(userAgent) ||
            (device?.platform === 'MacIntel' && device?.maxTouchPoints > 1)) return 'ios';
        return /Android/i.test(userAgent) ? 'android' : 'desktop';
    });
    const canInstall = computed(() =>
        !installed.value && !installing.value && deferredPrompt.value !== null
    );

    const updateInstalled = () => {
        installed.value = installedThisSession || device?.standalone === true ||
            mediaQueries.some((query) => query.matches);
        if (installed.value) deferredPrompt.value = null;
    };

    const onBeforeInstallPrompt = (event) => {
        if (installed.value || typeof event.prompt !== 'function') return;
        event.preventDefault();
        deferredPrompt.value = event;
        error.value = '';
    };

    const onAppInstalled = () => {
        installedThisSession = true;
        error.value = '';
        updateInstalled();
    };

    const install = async () => {
        if (installed.value) return 'installed';
        if (installing.value) return 'busy';
        error.value = '';
        const event = deferredPrompt.value;
        if (!event) return 'unavailable';

        // A captured event may only be prompted once, including after dismissal.
        deferredPrompt.value = null;
        installing.value = true;
        try {
            // Keep this before the first await so the click's user activation is retained.
            const choice = await event.prompt();
            const result = choice || await event.userChoice;
            return result?.outcome === 'accepted' ? 'accepted' : 'dismissed';
        } catch {
            error.value = 'Installation could not start. You can still install from your browser menu.';
            return 'error';
        } finally {
            installing.value = false;
        }
    };

    updateInstalled();
    browser?.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    browser?.addEventListener('appinstalled', onAppInstalled);
    mediaQueries.forEach((query) => {
        if (query.addEventListener) query.addEventListener('change', updateInstalled);
        else query.addListener?.(updateInstalled);
    });

    if (getCurrentScope()) onScopeDispose(() => {
        browser?.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        browser?.removeEventListener('appinstalled', onAppInstalled);
        mediaQueries.forEach((query) => {
            if (query.removeEventListener) query.removeEventListener('change', updateInstalled);
            else query.removeListener?.(updateInstalled);
        });
        deferredPrompt.value = null;
    });

    return { installed, canInstall, installing, error, installPlatform, install };
};

import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope } from 'vue';
import { useAppInstall } from '../src/composables/useAppInstall.js';

const setup = (navigator = {}, displayMode = '') => {
    const window = new EventTarget();
    const queries = new Map();
    window.matchMedia = (media) => {
        const query = new EventTarget();
        query.matches = media === `(display-mode: ${displayMode})`;
        queries.set(media, query);
        return query;
    };
    const scope = effectScope();
    const app = scope.run(() => useAppInstall({ window, navigator }));
    return { app, window, queries, dispose: () => scope.stop() };
};

const offerInstall = (window, prompt, userChoice) => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = prompt;
    if (userChoice) event.userChoice = userChoice;
    window.dispatchEvent(event);
    return event;
};

test('native prompt starts in the click turn and consumes the event after dismissal', async (context) => {
    const { app, window, dispose } = setup();
    context.after(dispose);
    let prompted = false;
    let finish;
    const event = offerInstall(window, () => {
        prompted = true;
        return new Promise((resolve) => { finish = resolve; });
    });
    assert.equal(event.defaultPrevented, true);
    assert.equal(app.canInstall.value, true);

    const result = app.install();
    assert.equal(prompted, true);
    assert.equal(app.installing.value, true);
    assert.equal(app.canInstall.value, false);
    assert.equal(await app.install(), 'busy');
    finish({ outcome: 'dismissed' });
    assert.equal(await result, 'dismissed');
    assert.equal(app.installing.value, false);
    assert.equal(await app.install(), 'unavailable');

    offerInstall(window, () => Promise.resolve({ outcome: 'accepted' }));
    assert.equal(app.canInstall.value, true);
    assert.equal(await app.install(), 'accepted');
});

test('legacy prompts await userChoice and installation from browser UI clears the action', async (context) => {
    const { app, window, queries, dispose } = setup();
    context.after(dispose);
    offerInstall(window, () => undefined, Promise.resolve({ outcome: 'accepted' }));
    assert.equal(await app.install(), 'accepted');
    offerInstall(window, () => assert.fail('installed apps must not prompt'));
    window.dispatchEvent(new Event('appinstalled'));
    assert.equal(app.installed.value, true);
    assert.equal(app.canInstall.value, false);
    assert.equal(await app.install(), 'installed');

    // A subsequent media-query event must not undo a confirmed installation.
    queries.get('(display-mode: standalone)').dispatchEvent(new Event('change'));
    assert.equal(app.installed.value, true);
});

test('failed prompts expose an error and remain available for manual installation', async (context) => {
    const { app, window, dispose } = setup();
    context.after(dispose);
    offerInstall(window, () => { throw new Error('Browser refused the prompt'); });
    assert.equal(await app.install(), 'error');
    assert.match(app.error.value, /browser menu/);
    assert.equal(app.installing.value, false);
    assert.equal(await app.install(), 'unavailable');
    assert.equal(app.error.value, '');
});

test('installed launch detection includes iOS and display-mode changes', (context) => {
    const ios = setup({ standalone: true, userAgent: 'iPhone' });
    const standalone = setup({}, 'standalone');
    const browser = setup();
    context.after(() => [ios, standalone, browser].forEach(({ dispose }) => dispose()));
    assert.equal(ios.app.installed.value, true);
    assert.equal(standalone.app.installed.value, true);
    assert.equal(browser.app.installed.value, false);
    const query = browser.queries.get('(display-mode: standalone)');
    query.matches = true;
    query.dispatchEvent(new Event('change'));
    assert.equal(browser.app.installed.value, true);
    query.matches = false;
    query.dispatchEvent(new Event('change'));
    assert.equal(browser.app.installed.value, false);
});

test('manual instructions recognize iPadOS desktop user agents and Android', (context) => {
    const ipad = setup({ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Macintosh' });
    const android = setup({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' });
    const desktop = setup({ platform: 'MacIntel', maxTouchPoints: 0 });
    context.after(() => [ipad, android, desktop].forEach(({ dispose }) => dispose()));
    assert.equal(ipad.app.installPlatform.value, 'ios');
    assert.equal(android.app.installPlatform.value, 'android');
    assert.equal(desktop.app.installPlatform.value, 'desktop');
});

test('disposing the component removes install and media-query listeners', () => {
    const { app, window, queries, dispose } = setup();
    offerInstall(window, () => assert.fail('disposed prompts must be forgotten'));
    dispose();
    assert.equal(app.canInstall.value, false);
    const event = offerInstall(window, () => assert.fail('disposed listeners must be removed'));
    assert.equal(event.defaultPrevented, false);
    window.dispatchEvent(new Event('appinstalled'));
    const query = queries.get('(display-mode: standalone)');
    query.matches = true;
    query.dispatchEvent(new Event('change'));
    assert.equal(app.installed.value, false);
    assert.equal(app.canInstall.value, false);
});

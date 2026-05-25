describe('Storage fallback', () => {
    const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

    beforeAll(async () => {
        const deniedStorageGetter = () => {
            throw new DOMException('Access is denied for this document.', 'SecurityError');
        };

        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get: deniedStorageGetter
        });

        Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            get: deniedStorageGetter
        });

        window.name = '';
        delete window.POS_API;

        await import('../../database.js');
    });

    afterAll(() => {
        if (originalLocalStorageDescriptor) {
            Object.defineProperty(window, 'localStorage', originalLocalStorageDescriptor);
        }

        if (originalSessionStorageDescriptor) {
            Object.defineProperty(window, 'sessionStorage', originalSessionStorageDescriptor);
        }

        window.name = '';
        delete window.POS_API;
    });

    test('auth helpers fall back when browser storage is blocked', () => {
        window.POS_API.setAuthToken('sample-token');
        window.POS_API.setAuthUser({ username: 'admin', role: 'admin' });

        expect(window.POS_API.getAuthToken()).toBe('sample-token');
        expect(window.POS_API.getAuthUser()).toEqual({ username: 'admin', role: 'admin' });
        expect(window.name).toContain('__fashion_shaa_pos_storage__=');
    });

    test('state initialization reads feature flags without touching blocked localStorage', async () => {
        window.POS_API.storage.setItem('pos_testing_mode', 'true');
        window.POS_API.storage.setItem('enableKeyboardShortcuts', 'false');

        const { state } = await import('../../js/state.js');

        expect(state.testingMode).toBe(true);
        expect(state.enableKeyboardShortcuts).toBe(false);
    });
});

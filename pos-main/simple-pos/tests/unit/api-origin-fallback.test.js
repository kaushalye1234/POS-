describe('API origin fallback', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        sessionStorage.clear();
        delete window.POS_API;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        delete window.POS_API;
    });

    test('resolveApiOrigin falls back to local backend when saved remote origin is unreachable', async () => {
        localStorage.setItem('pos_api_origin', 'https://dead.example.com');

        global.fetch = jest.fn(async (url) => {
            if (url === 'https://dead.example.com/api/health') {
                throw new TypeError('Failed to fetch');
            }

            if (url === 'http://localhost:5000/api/health') {
                throw new TypeError('Failed to fetch');
            }

            if (url === 'http://127.0.0.1:5000/api/health') {
                return { ok: true };
            }

            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        await import('../../database.js');

        const resolvedOrigin = await window.POS_API.resolveApiOrigin({ forceRefresh: true });

        expect(resolvedOrigin).toBe('http://127.0.0.1:5000');
        expect(window.POS_API.getApiOrigin()).toBe('http://127.0.0.1:5000');
    });
});

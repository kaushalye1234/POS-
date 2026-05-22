const fetch = global.fetch || require('node-fetch');

async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function registerOrLogin(baseUrl, credentials = {}) {
    const payload = {
        username: credentials.username || 'integration_admin',
        password: credentials.password || 'TestPass123!',
        role: credentials.role || 'admin',
        employeeId: credentials.employeeId || 'E900'
    };

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const registerBody = await parseResponseBody(registerResponse);

    if (registerResponse.ok && registerBody && registerBody.token) {
        return {
            token: registerBody.token,
            user: registerBody.user,
            created: true
        };
    }

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: payload.username,
            password: payload.password
        })
    });
    const loginBody = await parseResponseBody(loginResponse);

    if (loginResponse.ok && loginBody && loginBody.token) {
        return {
            token: loginBody.token,
            user: loginBody.user,
            created: false
        };
    }

    const registerError = registerBody && registerBody.error ? registerBody.error : registerResponse.statusText;
    const loginError = loginBody && loginBody.error ? loginBody.error : loginResponse.statusText;
    throw new Error(`Auth bootstrap failed. Register: ${registerResponse.status} ${registerError}; Login: ${loginResponse.status} ${loginError}`);
}

function jsonHeaders(token) {
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

module.exports = {
    registerOrLogin,
    jsonHeaders
};

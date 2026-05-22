/**
 * override.js
 * Handles Admin PIN Override Modal Logic
 */

let overridePromiseResolve = null;
let overridePromiseReject = null;

const modal = document.getElementById('overrideModal');
const closeBtn = document.getElementById('closeOverrideModal');
const submitBtn = document.getElementById('overrideSubmit');
const pinInput = document.getElementById('overridePin');
const errorMsg = document.getElementById('overrideError');
const reasonText = document.getElementById('overrideReason');

function hideModal() {
    modal.classList.remove('active');
    pinInput.value = '';
    errorMsg.classList.add('hidden');
}

export function requestAdminOverride(reason = 'Admin permission required.') {
    return new Promise((resolve, reject) => {
        overridePromiseResolve = resolve;
        overridePromiseReject = reject;
        
        reasonText.textContent = reason;
        modal.classList.add('active');
        pinInput.focus();
    });
}

async function handleOverrideSubmit() {
    const pin = pinInput.value.trim();
    if (!pin) {
        errorMsg.textContent = 'Please enter a PIN.';
        errorMsg.classList.remove('hidden');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';
    errorMsg.classList.add('hidden');
    
    try {
        const posApi = window.POS_API || {};
        if (typeof posApi.fetchAPI !== 'function') {
            throw new Error('POS API helper is unavailable.');
        }

        await posApi.fetchAPI('/auth/override', {
            method: 'POST',
            body: { pin }
        });
        
        // Success
        hideModal();
        if (overridePromiseResolve) overridePromiseResolve(true);
        
    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.classList.remove('hidden');
        if (overridePromiseReject) overridePromiseReject(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Authorize';
    }
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        hideModal();
        if (overridePromiseResolve) overridePromiseResolve(false);
    });
}

if (submitBtn) {
    submitBtn.addEventListener('click', handleOverrideSubmit);
}

if (pinInput) {
    pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleOverrideSubmit();
    });
}

window.requestAdminOverride = requestAdminOverride;

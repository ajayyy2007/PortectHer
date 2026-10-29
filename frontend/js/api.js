// Dynamically determine API Base URL safely across localhost, ports, and file:// protocol
const getApiBaseUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:5000/api';
    if (window.location.protocol === 'file:') {
        return 'http://localhost:5000/api';
    }
    const host = window.location.hostname || 'localhost';
    const port = (window.location.port === '5000' || !window.location.port) ? '5000' : '5000';
    return `${window.location.protocol}//${host}:${port}/api`;
};

const API_URL = getApiBaseUrl();

const safeFetch = async (url, options) => {
    try {
        return await fetch(url, options);
    } catch (err) {
        if (err.name === 'TypeError' || (err.message && err.message.toLowerCase().includes('fetch'))) {
            throw new Error('Backend server is offline. Please make sure the backend server is running on port 5000.');
        }
        throw err;
    }
};

const handleResponse = async (res, defaultErrMsg = 'Request failed') => {
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        if (!res.ok) {
            throw new Error(`Backend Error (${res.status}): Please check backend server.`);
        }
        throw new Error('Invalid response from server');
    }
    if (!res.ok) {
        throw new Error(data.msg || defaultErrMsg);
    }
    return data;
};

const api = {
    // Auth
    register: async (userData) => {
        const res = await safeFetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        return await handleResponse(res, 'Registration failed');
    },
    login: async (credentials) => {
        const res = await safeFetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        return await handleResponse(res, 'Login failed');
    },
    deleteAccount: async (token) => {
        const res = await safeFetch(`${API_URL}/auth/account`, {
            method: 'DELETE',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to delete account');
    },
    
    // Contacts
    getContacts: async (token) => {
        const res = await safeFetch(`${API_URL}/contacts`, {
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to fetch contacts');
    },
    addContact: async (contactData, token) => {
        const res = await safeFetch(`${API_URL}/contacts`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(contactData)
        });
        return await handleResponse(res, 'Failed to add contact');
    },
    toggleWhatsApp: async (id, token) => {
        const res = await safeFetch(`${API_URL}/contacts/${id}/toggle-whatsapp`, {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to toggle WhatsApp status');
    },
    toggleSMS: async (id, token) => {
        const res = await safeFetch(`${API_URL}/contacts/${id}/toggle-sms`, {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to toggle SMS status');
    },
    toggleEmail: async (id, token) => {
        const res = await safeFetch(`${API_URL}/contacts/${id}/toggle-email`, {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to toggle Email status');
    },
    sendContactSMS: async (id, token, payload = {}) => {
        const res = await safeFetch(`${API_URL}/contacts/${id}/send-sms`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(payload)
        });
        return await handleResponse(res, 'Failed to send SMS to contact');
    },
    deleteContact: async (id, token) => {
        const res = await safeFetch(`${API_URL}/contacts/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to delete contact');
    },

    // SOS Core
    triggerSOS: async (locationPayload, token) => {
        const res = await safeFetch(`${API_URL}/sos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(locationPayload)
        });
        return await handleResponse(res, 'Failed to send SOS');
    },
    getSOSStatus: async (emergencyId, token) => {
        const res = await safeFetch(`${API_URL}/sos/status/${emergencyId}`, {
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to fetch SOS status');
    },
    retrySOSAlerts: async (emergencyId, token) => {
        const res = await safeFetch(`${API_URL}/sos/retry/${emergencyId}`, {
            method: 'POST',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to retry alerts');
    },
    updateLiveLocation: async (emergencyId, coords, token) => {
        const res = await safeFetch(`${API_URL}/sos/track/${emergencyId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(coords)
        });
        return await handleResponse(res, 'Failed to update live location');
    },
    getLiveTracking: async (emergencyId) => {
        const res = await safeFetch(`${API_URL}/sos/track/${emergencyId}`);
        return await handleResponse(res, 'Failed to fetch tracking data');
    },
    endEmergency: async (emergencyId, token) => {
        const url = emergencyId ? `${API_URL}/sos/end/${emergencyId}` : `${API_URL}/sos/end`;
        const res = await safeFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ emergencyId })
        });
        return await handleResponse(res, 'Failed to end emergency');
    },
    addEvidence: async (evidenceData, token) => {
        const res = await safeFetch(`${API_URL}/alerts/evidence`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ evidenceData })
        });
        return await handleResponse(res, 'Failed to submit evidence');
    },
    uploadEvidenceToSOS: async (emergencyId, evidenceData, token) => {
        const res = await safeFetch(`${API_URL}/sos/evidence/${emergencyId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(evidenceData)
        });
        return await handleResponse(res, 'Failed to attach evidence to emergency');
    },

    // Alerts (Community)
    getActiveAlerts: async () => {
        const res = await safeFetch(`${API_URL}/alerts`);
        return await handleResponse(res, 'Failed to fetch active alerts');
    },
    resolveAlerts: async (token) => {
        const res = await safeFetch(`${API_URL}/alerts/resolve`, {
            method: 'POST',
            headers: { 'x-auth-token': token }
        });
        return await handleResponse(res, 'Failed to resolve alerts');
    }
};

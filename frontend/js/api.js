const API_URL = 'http://localhost:5000/api';

const api = {
    // Auth
    register: async (userData) => {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Registration failed');
        return data;
    },
    login: async (credentials) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Login failed');
        return data;
    },
    
    // Contacts
    getContacts: async (token) => {
        const res = await fetch(`${API_URL}/contacts`, {
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) throw new Error('Failed to fetch contacts');
        return await res.json();
    },
    addContact: async (contactData, token) => {
        const res = await fetch(`${API_URL}/contacts`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(contactData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Failed to add contact');
        return data;
    },
    deleteContact: async (id, token) => {
        const res = await fetch(`${API_URL}/contacts/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-token': token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Failed to delete contact');
        return data;
    },

    // SOS
    triggerSOS: async (location, token) => {
        const res = await fetch(`${API_URL}/sos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(location)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Failed to send SOS');
        return data;
    },

    // Alerts (Community)
    getActiveAlerts: async () => {
        const res = await fetch(`${API_URL}/alerts`);
        if (!res.ok) throw new Error('Failed to fetch active alerts');
        return await res.json();
    },
    resolveAlerts: async (token) => {
        const res = await fetch(`${API_URL}/alerts/resolve`, {
            method: 'POST',
            headers: { 'x-auth-token': token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Failed to resolve alerts');
        return data;
    },
    addEvidence: async (evidenceData, token) => {
        const res = await fetch(`${API_URL}/alerts/evidence`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ evidenceData })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Failed to submit evidence');
        return data;
    }
};

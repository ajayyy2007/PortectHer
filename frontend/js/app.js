// State
let currentUser = null;
let currentToken = null;

// DOM Elements
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const toast = document.getElementById('toast');

// Views handling
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    
    if(tab === 'login') {
        document.querySelector('.auth-tabs .tab-btn:nth-child(1)').classList.add('active');
        document.getElementById('login-form').classList.add('active');
    } else {
        document.querySelector('.auth-tabs .tab-btn:nth-child(2)').classList.add('active');
        document.getElementById('register-form').classList.add('active');
    }
}

function switchMainTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if(tab === 'dashboard') {
        document.querySelector('.nav-links .nav-btn:nth-child(1)').classList.add('active');
        const dash = document.getElementById('dashboard-tab');
        dash.classList.remove('hidden');
        dash.classList.add('active');
        if(window.map) {
            setTimeout(() => window.map.invalidateSize(), 150);
        }
    } else {
        document.querySelector('.nav-links .nav-btn:nth-child(2)').classList.add('active');
        const contacts = document.getElementById('contacts-tab');
        contacts.classList.remove('hidden');
        contacts.classList.add('active');
        loadContacts();
    }
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast hidden'; }, 4000);
}

// Authentication
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const submitBtn = e.target.querySelector('button');
        submitBtn.innerHTML = 'Signing In...'; submitBtn.disabled = true;
        const data = await api.login({ email, password });
        handleAuthSuccess(data);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        const submitBtn = e.target.querySelector('button');
        submitBtn.innerHTML = 'Sign In'; submitBtn.disabled = false;
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    
    try {
        const submitBtn = e.target.querySelector('button');
        submitBtn.innerHTML = 'Creating Account...'; submitBtn.disabled = true;
        const data = await api.register({ name, email, phone, password });
        handleAuthSuccess(data);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        const submitBtn = e.target.querySelector('button');
        submitBtn.innerHTML = 'Create Account'; submitBtn.disabled = false;
    }
});

function handleAuthSuccess(data) {
    currentUser = data.user;
    currentToken = data.token;
    localStorage.setItem('token', currentToken);
    
    authView.classList.remove('active');
    setTimeout(() => {
        authView.classList.add('hidden');
        mainView.classList.remove('hidden');
        mainView.classList.add('active');
        
        showToast(`Welcome, ${currentUser.name}!`);
        if(typeof initMap === 'function') initMap();
    }, 300);
}

function logout() {
    currentUser = null;
    currentToken = null;
    localStorage.removeItem('token');
    
    mainView.classList.remove('active');
    setTimeout(() => {
        mainView.classList.add('hidden');
        authView.classList.remove('hidden');
        authView.classList.add('active');
        showToast('Logged out successfully');
    }, 300);
}

// Contacts Management
async function loadContacts() {
    const container = document.getElementById('contacts-container');
    container.innerHTML = '<div class="loader" style="color:white;">Loading contacts...</div>';
    
    try {
        const contacts = await api.getContacts(currentToken);
        if(contacts.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1;">No emergency contacts added yet. Add one to ensure your safety!</p>';
            return;
        }
        
        container.innerHTML = contacts.map(c => `
            <div class="contact-card">
                <div class="contact-actions">
                    <button class="btn-icon delete" onclick="deleteContact('${c._id}')" title="Remove Contact"><i class="fa-solid fa-trash"></i></button>
                </div>
                <h4>${c.name}</h4>
                <p><i class="fa-solid fa-phone" style="width:20px; color:var(--text-muted)"></i> ${c.phone}</p>
                <p><i class="fa-solid fa-envelope" style="width:20px; color:var(--text-muted)"></i> ${c.email}</p>
                <span class="contact-relation">${c.relation}</span>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
    }
}

document.getElementById('add-contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const contactData = {
        name: document.getElementById('contact-name').value,
        phone: document.getElementById('contact-phone').value,
        email: document.getElementById('contact-email').value,
        relation: document.getElementById('contact-relation').value
    };
    
    try {
        const submitBtn = e.target.querySelector('button');
        submitBtn.innerHTML = 'Saving...'; submitBtn.disabled = true;
        
        await api.addContact(contactData, currentToken);
        showToast('Emergency contact added successfully');
        e.target.reset();
        loadContacts();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        const submitBtn = e.target.querySelector('button');
        submitBtn.innerHTML = 'Save Contact'; submitBtn.disabled = false;
    }
});

async function deleteContact(id) {
    if(confirm('Are you sure you want to remove this emergency contact?')) {
        try {
            await api.deleteContact(id, currentToken);
            showToast('Emergency contact removed');
            loadContacts();
        } catch(err) {
            showToast(err.message, 'error');
        }
    }
}

// ---------------- ADVANCED FEATURES ----------------

// Fake Call System
function activateFakeCall() {
    const screen = document.getElementById('fake-call-screen');
    const ringtone = document.getElementById('ringtone');
    
    // Slight delay to simulate natural incoming call
    showToast("Fake call will ring in 3 seconds...");
    setTimeout(() => {
        screen.classList.remove('hidden');
        ringtone.play().catch(e => console.log('Audio play failed:', e));
    }, 3000);
}

function stopFakeCall() {
    const screen = document.getElementById('fake-call-screen');
    const ringtone = document.getElementById('ringtone');
    screen.classList.add('hidden');
    ringtone.pause();
    ringtone.currentTime = 0;
}

// Auto Evidence Capture System
async function captureEvidence() {
    return new Promise(async (resolve) => {
        const video = document.getElementById('evidence-video');
        const canvas = document.getElementById('evidence-canvas');
        if(!video || !canvas) return resolve(null);

        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Camera blocked! You must use HTTPS or localhost.", "error");
            return resolve(null);
        }

        try {
            // Request camera access silently
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            video.srcObject = stream;
            
            // Wait for video to be ready
            video.onloadedmetadata = () => {
                video.play();
                setTimeout(() => {
                    // Draw current frame to canvas
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;
                    const context = canvas.getContext('2d');
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    // Convert to Base64
                    const photoData = canvas.toDataURL('image/jpeg', 0.8);
                    
                    // Stop the camera
                    stream.getTracks().forEach(track => track.stop());

                    resolve(photoData);
                }, 800); // Wait slightly longer for phone cameras to focus
            };
        } catch (err) {
            console.warn('Camera access denied or unavailable for auto-evidence capture:', err);
            showToast("Camera error: " + err.message, "error");
            resolve(null);
        }
    });
}

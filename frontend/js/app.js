// State
let currentUser = null;
let currentToken = localStorage.getItem('token') || null;
window.currentUser = currentUser;
window.currentToken = currentToken;

// DOM Elements
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const toast = document.getElementById('toast');

// Automatically restore session from localStorage if token exists
window.addEventListener('DOMContentLoaded', async () => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
        currentToken = savedToken;
        try {
            const res = await safeFetch(`${API_URL}/auth/me`, {
                headers: { 'x-auth-token': savedToken }
            });
            if (res.ok) {
                const user = await res.json();
                currentUser = user;
                authView.classList.remove('active');
                authView.classList.add('hidden');
                mainView.classList.remove('hidden');
                mainView.classList.add('active');
                if (typeof initMap === 'function') initMap();
            } else {
                localStorage.removeItem('token');
                currentToken = null;
            }
        } catch (e) {
            // Network offline or server starting up - keep token available
            currentToken = savedToken;
        }
    }
});

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
    setTimeout(() => { toast.className = 'toast hidden'; }, 4500);
}

// Authentication
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password').value;

    if (!email) {
        return showToast('Please enter your Email Address', 'error');
    }
    
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
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const countryCode = document.getElementById('reg-country-code')?.value || '+91';
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!name) {
        return showToast('Please enter your full name', 'error');
    }
    if (!email) {
        return showToast('Email address is required to register', 'error');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return showToast('Please enter a valid email address', 'error');
    }
    if (!phone) {
        return showToast('Mobile phone number is required to register', 'error');
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
        return showToast('Please enter a valid mobile number (7 to 15 digits)', 'error');
    }
    if (!password) {
        return showToast('Password is required', 'error');
    }
    if (password.length < 6) {
        return showToast('Password must be at least 6 characters long', 'error');
    }

    const submitBtn = document.getElementById('btn-create-account') || e.target.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) return;

    try {
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
            submitBtn.disabled = true;
        }
        const data = await api.register({ name, email, phone, countryCode, password });
        showToast('Account created successfully!', 'success');
        handleAuthSuccess(data);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = 'Create Account';
            submitBtn.disabled = false;
        }
    }
});

function handleAuthSuccess(data) {
    currentUser = data.user;
    currentToken = data.token;
    window.currentUser = data.user;
    window.currentToken = data.token;
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
    window.currentUser = null;
    window.currentToken = null;
    localStorage.removeItem('token');
    
    mainView.classList.remove('active');
    setTimeout(() => {
        mainView.classList.add('hidden');
        authView.classList.remove('hidden');
        authView.classList.add('active');
        showToast('Logged out successfully');
    }, 300);
}

async function deleteAccount() {
    if (!currentToken) return;
    const confirmed = confirm('⚠️ ARE YOU SURE YOU WANT TO DELETE YOUR ACCOUNT?\n\nThis will permanently delete your account profile, all your emergency contacts, and active alerts. This action cannot be undone!');
    if (confirmed) {
        try {
            const res = await api.deleteAccount(currentToken);
            showToast(res.msg || 'Account permanently deleted', 'success');
            
            currentUser = null;
            currentToken = null;
            localStorage.removeItem('token');
            
            mainView.classList.remove('active');
            setTimeout(() => {
                mainView.classList.add('hidden');
                authView.classList.remove('hidden');
                authView.classList.add('active');
            }, 300);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
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
            <div class="contact-card" style="position: relative; padding-bottom: 50px;">
                <div class="contact-actions">
                    <button class="btn-icon delete" onclick="deleteContact('${c._id}')" title="Remove Contact"><i class="fa-solid fa-trash"></i></button>
                </div>
                <h4>${c.name}</h4>
                <p><i class="fa-solid fa-phone" style="width:20px; color:var(--text-muted)"></i> ${c.countryCode || '+91'} ${c.phone}</p>
                <p><i class="fa-solid fa-envelope" style="width:20px; color:var(--text-muted)"></i> ${c.email}</p>
                <span class="contact-relation">${c.relation}</span>
                
                <div style="position: absolute; bottom: 10px; left: 14px; right: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                    <button onclick="toggleWhatsAppAlerts('${c._id}')" class="btn btn-sm" style="background: ${c.whatsappEnabled !== false ? 'rgba(37,211,102,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${c.whatsappEnabled !== false ? '#25D366' : '#ef4444'}; border: 1px solid ${c.whatsappEnabled !== false ? 'rgba(37,211,102,0.4)' : 'rgba(239,68,68,0.4)'}; padding: 4px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; cursor: pointer;">
                        <i class="fa-brands fa-whatsapp"></i> WA: ${c.whatsappEnabled !== false ? 'ON' : 'OFF'}
                    </button>
                    <button onclick="toggleEmailAlerts('${c._id}')" class="btn btn-sm" style="background: ${c.emailEnabled !== false ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${c.emailEnabled !== false ? '#f59e0b' : '#ef4444'}; border: 1px solid ${c.emailEnabled !== false ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; padding: 4px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; cursor: pointer;">
                        <i class="fa-solid fa-envelope"></i> Email: ${c.emailEnabled !== false ? 'ON' : 'OFF'}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
    }
}

async function toggleWhatsAppAlerts(contactId) {
    try {
        const res = await api.toggleWhatsApp(contactId, currentToken);
        showToast(res.msg, 'success');
        loadContacts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleEmailAlerts(contactId) {
    try {
        const res = await api.toggleEmail(contactId, currentToken);
        showToast(res.msg, 'success');
        loadContacts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

document.getElementById('add-contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const contactData = {
        name: document.getElementById('contact-name').value.trim(),
        countryCode: document.getElementById('contact-country-code')?.value || '+91',
        phone: document.getElementById('contact-phone').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
        relation: document.getElementById('contact-relation').value,
        whatsappEnabled: document.getElementById('contact-whatsapp-enabled')?.checked !== false,
        smsEnabled: false,
        emailEnabled: document.getElementById('contact-email-enabled')?.checked !== false
    };
    
    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.innerHTML = 'Saving...'; submitBtn.disabled = true;
        
        await api.addContact(contactData, currentToken);
        showToast('Emergency contact added successfully');
        e.target.reset();
        loadContacts();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
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

// Helper to select real physical camera device ID (excluding virtual camera drivers)
async function getRealCameraDeviceId() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return null;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length === 0) return null;

        const virtualKeywords = /iriun|obs|droidcam|epoccam|snap|virtual|manycam|finecam|cyberlink|vcamera/i;

        // 1. First priority: Physical cameras (integrated/webcam/USB) that do NOT match virtual camera keywords
        const realPhysicalCameras = videoDevices.filter(d => {
            const label = d.label || '';
            return !virtualKeywords.test(label);
        });

        if (realPhysicalCameras.length > 0) {
            // Prefer front / user facing or integrated webcam if available
            const frontCam = realPhysicalCameras.find(d => /front|user|facing|integrated|builtin|webcam/i.test(d.label));
            return frontCam ? frontCam.deviceId : realPhysicalCameras[0].deviceId;
        }

        return videoDevices[0].deviceId;
    } catch (e) {
        return null;
    }
}

// Helper to wait until video element has active camera stream frames and dimensions
async function waitForVideoReady(video, maxWaitMs = 1500) {
    if (video.readyState >= 2 && video.videoWidth > 0) return true;
    return new Promise((resolve) => {
        let settled = false;
        const done = (val) => {
            if (!settled) {
                settled = true;
                video.removeEventListener('loadeddata', onReady);
                video.removeEventListener('canplay', onReady);
                resolve(val);
            }
        };
        const onReady = () => done(true);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('canplay', onReady);
        setTimeout(() => done(video.readyState >= 2 && video.videoWidth > 0), maxWaitMs);
    });
}

// Helper to verify if canvas snapshot contains real camera pixels (not virtual camera placeholder card)
function isRealCameraFrame(ctx, width, height) {
    try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        if (!data || data.length === 0) return false;

        let totalSampled = 0;
        let topBottomBlackCount = 0;
        let middleWhiteCount = 0;
        let nonZeroAlpha = 0;

        const step = Math.max(1, Math.floor((data.length / 4) / 400));

        for (let i = 0; i < data.length; i += step * 4) {
            const pixelIndex = i / 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 50) continue;
            nonZeroAlpha++;
            totalSampled++;

            const yRatio = Math.floor(pixelIndex / width) / height;

            // Top 30% or Bottom 30% of the image height
            if (yRatio < 0.30 || yRatio > 0.70) {
                if (r <= 18 && g <= 18 && b <= 18) {
                    topBottomBlackCount++;
                }
            } else {
                // Middle 40% height of the image
                if (r >= 225 && g >= 225 && b >= 225) {
                    middleWhiteCount++;
                }
            }
        }

        if (totalSampled === 0 || nonZeroAlpha === 0) return false;

        const topBottomBlackRatio = topBottomBlackCount / totalSampled;
        const middleWhiteRatio = middleWhiteCount / totalSampled;

        // Detect virtual camera disconnected logo card (black top/bottom + white center card)
        if (topBottomBlackRatio > 0.35 && middleWhiteRatio > 0.15) {
            console.warn("isRealCameraFrame: Virtual camera placeholder card detected, skipping frame...", { topBottomBlackRatio, middleWhiteRatio });
            return false;
        }

        return true;
    } catch (e) {
        return true; // Fallback on security exception
    }
}

// Unified Auto Evidence Capture System (Photo & 5-Second Voice concurrently)
async function captureSOSEvidence(durationMs = 5000, onAudioCountdown = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Camera/Mic blocked! You must use HTTPS or localhost.", "error");
        return { evidence: null, audio: null };
    }

    // Try to get real physical camera device ID first
    const realDeviceId = await getRealCameraDeviceId();
    let videoConstraints = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };
    if (realDeviceId) {
        videoConstraints = { deviceId: { exact: realDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } };
    }

    let stream = null;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: true
        });
    } catch (e1) {
        console.warn("Real camera constraint failed, trying standard fallback:", e1);
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e2) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (e3) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (e4) {
                    console.error("No camera or microphone permissions granted:", e4);
                    return { evidence: null, audio: null };
                }
            }
        }
    }

    if (!stream) return { evidence: null, audio: null };

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    // 1. Concurrent Photo Capture Promise
    const photoPromise = (async () => {
        if (!videoTrack) return null;
        try {
            let overlay = document.getElementById('evidence-capture-overlay');
            let video = document.getElementById('evidence-video');
            
            if (overlay) overlay.style.display = 'block';

            if (!video) {
                video = document.createElement('video');
                video.id = 'evidence-video';
                document.body.appendChild(video);
            }
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.srcObject = stream;

            await video.play().catch(e => console.warn("Video play error:", e));

            // Fast wait for camera stream (max 600ms)
            await waitForVideoReady(video, 600);

            let canvas = document.getElementById('evidence-canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'evidence-canvas';
                document.body.appendChild(canvas);
            }

            const ctx = canvas.getContext('2d');
            let capturedData = null;

            for (let attempt = 0; attempt < 5; attempt++) {
                const width = video.videoWidth || 640;
                const height = video.videoHeight || 480;
                if (width > 0 && height > 0 && video.readyState >= 2) {
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(video, 0, 0, width, height);

                    if (isRealCameraFrame(ctx, width, height)) {
                        capturedData = canvas.toDataURL('image/jpeg', 0.85);
                        break;
                    }
                }
                await new Promise(r => setTimeout(r, 60));
            }

            // Guaranteed fallback snapshot if capturedData is still null
            if (!capturedData) {
                const w = video.videoWidth > 0 ? video.videoWidth : 640;
                const h = video.videoHeight > 0 ? video.videoHeight : 480;
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(video, 0, 0, w, h);
                capturedData = canvas.toDataURL('image/jpeg', 0.85);
            }

            if (overlay) {
                setTimeout(() => { overlay.style.display = 'none'; }, 300);
            }
            return capturedData;
        } catch (photoErr) {
            console.error("Photo capture error:", photoErr);
            let overlay = document.getElementById('evidence-capture-overlay');
            if (overlay) overlay.style.display = 'none';
            return null;
        }
    })();

    // 2. Concurrent Ambient Audio Recording Promise (Exactly 5 seconds)
    const audioPromise = (async () => {
        if (!audioTrack) return null;
        if (typeof MediaRecorder === 'undefined') {
            console.warn("MediaRecorder is not supported in this browser.");
            return null;
        }

        try {
            const audioStream = new MediaStream([audioTrack]);

            // Audio codec detection using MediaRecorder.isTypeSupported()
            const mimeCandidates = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4;codecs=mp4a.40.2',
                'audio/mp4',
                'audio/aac',
                'audio/ogg;codecs=opus',
                'audio/wav'
            ];
            let selectedMime = '';
            for (const candidate of mimeCandidates) {
                if (MediaRecorder.isTypeSupported(candidate)) {
                    selectedMime = candidate;
                    break;
                }
            }

            const recorderOptions = selectedMime ? { mimeType: selectedMime } : undefined;
            const mediaRecorder = recorderOptions ? new MediaRecorder(audioStream, recorderOptions) : new MediaRecorder(audioStream);
            const audioChunks = [];

            return await new Promise((resolve) => {
                let countdownInterval = null;
                let stopTimer = null;

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstart = () => {
                    console.log(`[Audio Capture] Recording started (mimeType: ${mediaRecorder.mimeType || selectedMime || 'default'}), 5-second timer started.`);
                    let remaining = Math.ceil(durationMs / 1000);
                    if (typeof onAudioCountdown === 'function') {
                        onAudioCountdown(remaining);
                    }
                    countdownInterval = setInterval(() => {
                        remaining--;
                        if (remaining > 0 && typeof onAudioCountdown === 'function') {
                            onAudioCountdown(remaining);
                        }
                    }, 1000);

                    // Wait exactly durationMs (5000 ms) starting from onstart
                    stopTimer = setTimeout(() => {
                        if (countdownInterval) clearInterval(countdownInterval);
                        if (mediaRecorder.state !== 'inactive') {
                            try {
                                mediaRecorder.stop();
                            } catch (e) {
                                console.warn("Error stopping MediaRecorder:", e);
                            }
                        }
                    }, durationMs);
                };

                mediaRecorder.onerror = (recErr) => {
                    console.error("MediaRecorder error:", recErr);
                    if (countdownInterval) clearInterval(countdownInterval);
                    if (stopTimer) clearTimeout(stopTimer);
                    resolve(null);
                };

                mediaRecorder.onstop = () => {
                    if (countdownInterval) clearInterval(countdownInterval);
                    if (stopTimer) clearTimeout(stopTimer);

                    const totalBytes = audioChunks.reduce((acc, chunk) => acc + (chunk.size || 0), 0);
                    if (totalBytes === 0) {
                        console.warn("Audio recording ended with 0 bytes.");
                        resolve(null);
                        return;
                    }

                    const finalMime = mediaRecorder.mimeType || selectedMime || 'audio/webm';
                    const audioBlob = new Blob(audioChunks, { type: finalMime });
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve(reader.result);
                    };
                    reader.onerror = () => {
                        resolve(null);
                    };
                    reader.readAsDataURL(audioBlob);
                };

                mediaRecorder.start();
            });
        } catch (audioErr) {
            console.error("Audio recording error:", audioErr);
            return null;
        }
    })();

    // Run Photo Snapshot and 5-Second Voice Note simultaneously
    let photoData = null;
    let audioData = null;
    try {
        [photoData, audioData] = await Promise.all([photoPromise, audioPromise]);
    } catch (err) {
        console.error("Evidence capture error:", err);
    } finally {
        // Cleanup media tracks to release hardware locks
        try {
            stream.getTracks().forEach(track => track.stop());
        } catch (e) {}
    }

    return { evidence: photoData, audio: audioData };
}

// Global scope attachment
window.captureSOSEvidence = captureSOSEvidence;

// Backward compatibility helper
async function captureEvidence() {
    const res = await captureSOSEvidence(5000);
    return res.evidence;
}

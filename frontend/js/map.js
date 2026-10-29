/**
 * FLARE WOMEN SAFETY - MAP & SOS EMERGENCY ORCHESTRATION
 */

// Global State Initialisation
window.isSosActive = false;
window.currentLat = null;
window.currentLng = null;
window.currentAccuracy = null;
window.locationTimestamp = null;
window.activeEmergencyId = null;
window.watchId = null;
window.statusPollingInterval = null;

let map = null;
let marker = null;
let helpMarkers = [];
let alertsLayer = null;
let routingControl = null;
let pollingId = null;
let sosCountdownTimer = null;
let sosCountdownSeconds = 3;

// Helper to format channel status badges accurately matching Requirement 12
function getChannelBadge(channel, chData) {
    if (!chData) return '<span style="color:#94a3b8; font-size:0.75rem;">N/A</span>';
    const status = (chData.status || '').toLowerCase();
    
    if (channel === 'whatsapp') {
        if (status === 'delivered') return '<span style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid #10b981; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-check-double"></i> Delivered</span>';
        if (status === 'read') return '<span style="background:rgba(59,130,246,0.2); color:#3b82f6; border:1px solid #3b82f6; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-check-double"></i> Read</span>';
        if (status === 'sent' || status === 'accepted') return '<span style="background:rgba(59,130,246,0.2); color:#60a5fa; border:1px solid #60a5fa; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-paper-plane"></i> Accepted by provider</span>';
        if (status === 'simulated') return '<span style="background:rgba(168,85,247,0.2); color:#c084fc; border:1px solid #c084fc; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-vial"></i> Simulated (Dev)</span>';
        if (status === 'not_configured') return '<span style="background:rgba(234,179,8,0.2); color:#facc15; border:1px solid #facc15; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Not Configured</span>';
        if (status === 'disabled') return '<span style="background:rgba(148,163,184,0.2); color:#94a3b8; border:1px solid #64748b; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">Disabled</span>';
        return `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #f87171; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;" title="${chData.error || chData.detail || 'Failed'}"><i class="fa-solid fa-xmark"></i> Failed</span>`;
    }

    if (channel === 'email') {
        if (status === 'accepted_by_smtp') return '<span style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid #10b981; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-check"></i> Accepted by SMTP</span>';
        if (status === 'not_configured') return '<span style="background:rgba(234,179,8,0.2); color:#facc15; border:1px solid #facc15; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Not Configured</span>';
        if (status === 'disabled') return '<span style="background:rgba(148,163,184,0.2); color:#94a3b8; border:1px solid #64748b; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">Disabled</span>';
        if (status === 'invalid_email') return '<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #f87171; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">Invalid Email</span>';
        return `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #f87171; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;" title="${chData.error || chData.detail || 'Failed'}"><i class="fa-solid fa-xmark"></i> Failed</span>`;
    }

    return status;
}

function getWAOverview(wa) {
    if (!wa) return '0';
    if (wa.delivered) return `${wa.delivered} Delivered`;
    if (wa.sent) return `${wa.sent} Accepted`;
    if (wa.simulated) return `${wa.simulated} Simulated`;
    if (wa.notConfigured) return 'Not Configured';
    if (wa.failed) return `${wa.failed} Failed`;
    return '0';
}

function getEmailOverview(email) {
    if (!email) return '0';
    if (email.acceptedBySmtp) return `${email.acceptedBySmtp} Accepted`;
    if (email.notConfigured) return 'Not Configured';
    if (email.failed) return `${email.failed} Failed`;
    return '0';
}

// Update Evidence Badge (Photo / Audio) in the real-time display
function updateEvidenceStatusBadge(type, status, message) {
    const el = document.getElementById(`sos-${type}-status`);
    if (!el) return;

    if (status === 'captured') {
        el.innerHTML = `<span style="color:#38bdf8; font-weight:600;"><i class="fa-solid fa-camera"></i> Captured</span>`;
    } else if (status === 'recording') {
        el.innerHTML = `<span style="color:#f59e0b; font-weight:600;"><i class="fa-solid fa-microphone-lines fa-fade"></i> Recording...</span>`;
    } else if (status === 'uploading') {
        el.innerHTML = `<span style="color:#f59e0b; font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> Uploading...</span>`;
    } else if (status === 'uploaded') {
        el.innerHTML = `<span style="color:#10b981; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Uploaded & Secured</span>`;
    } else if (status === 'permission_denied') {
        el.innerHTML = `<span style="color:#94a3b8; font-weight:600;" title="${message || ''}"><i class="fa-solid fa-ban"></i> Permission Denied</span>`;
    } else if (status === 'failed') {
        el.innerHTML = `<span style="color:#f87171; font-weight:600;" title="${message || ''}"><i class="fa-solid fa-triangle-exclamation"></i> Failed</span>`;
    }
}

// Render the complete Real-Time Notification Status Dashboard matching Requirement 12
function renderNotificationDashboard(data) {
    const sosStatus = document.getElementById('sos-status');
    if (!sosStatus) return;

    const summary = data.summary || {};
    const contacts = data.contacts || [];
    const locationStatus = data.locationStatus || 'acquired';
    const emergencyId = data.emergencyId || window.activeEmergencyId || 'EMG_ACTIVE';

    const wa = summary.whatsapp || {};
    const email = summary.email || {};

    let locationBadgeHtml = '';
    if (locationStatus === 'acquired') {
        locationBadgeHtml = `<span style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid #10b981; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;"><i class="fa-solid fa-location-crosshairs"></i> Acquired (${data.latitude ? Number(data.latitude).toFixed(4) : ''}, ${data.longitude ? Number(data.longitude).toFixed(4) : ''}${data.locationAccuracy ? ' ±' + Math.round(data.locationAccuracy) + 'm' : ''})</span>`;
    } else if (locationStatus === 'last_known') {
        locationBadgeHtml = `<span style="background:rgba(234,179,8,0.2); color:#facc15; border:1px solid #facc15; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;"><i class="fa-solid fa-clock-rotate-left"></i> Last Known Location (${data.latitude ? Number(data.latitude).toFixed(4) : ''}, ${data.longitude ? Number(data.longitude).toFixed(4) : ''})</span>`;
    } else {
        locationBadgeHtml = `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #f87171; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;"><i class="fa-solid fa-location-slash"></i> Location Unavailable</span>`;
    }

    let contactsHtml = contacts.map(c => `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-weight: 700; color: #ffffff; font-size: 0.9rem;">${c.name}</span>
                <span style="font-size: 0.75rem; color: #94a3b8;">${c.phone || ''}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <i class="fa-brands fa-whatsapp" style="color: #25D366; font-size: 0.9rem;"></i>
                    ${getChannelBadge('whatsapp', c.channels?.whatsapp)}
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <i class="fa-solid fa-envelope" style="color: #f59e0b; font-size: 0.9rem;"></i>
                    ${getChannelBadge('email', c.channels?.email)}
                </div>
            </div>
            ${c.channels?.email?.error ? `<div style="font-size: 0.72rem; color: #f87171; margin-top: 4px;"><i class="fa-solid fa-circle-exclamation"></i> Email: ${c.channels.email.error}</div>` : ''}
            ${c.channels?.whatsapp?.error ? `<div style="font-size: 0.72rem; color: #f87171; margin-top: 2px;"><i class="fa-solid fa-circle-exclamation"></i> WhatsApp: ${c.channels.whatsapp.error}</div>` : ''}
        </div>
    `).join('');

    if (contacts.length === 0) {
        contactsHtml = `<div style="font-size: 0.82rem; color: #facc15; background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 8px; padding: 10px; margin-bottom: 8px;"><i class="fa-solid fa-triangle-exclamation"></i> No emergency contacts saved yet. Go to Contacts tab to add emergency contacts.</div>`;
    }

    sosStatus.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.9); border: 2px solid #ef4444; border-radius: 14px; padding: 16px; margin-top: 14px; text-align: left; box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);">
            <!-- Status Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(239, 68, 68, 0.3); padding-bottom: 10px;">
                <div style="color: #ef4444; font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite;"></span>
                    EMERGENCY ACTIVE
                </div>
                <button type="button" onclick="endActiveEmergency()" class="btn btn-sm" style="background: #10b981; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.82rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-shield-heart"></i> END EMERGENCY (I Am Safe)
                </button>
            </div>

            <!-- Emergency Metadata Bar -->
            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.8rem; color: #94a3b8;">
                <div>Ref: <strong style="color:#ffffff; font-family:monospace;">${emergencyId}</strong></div>
                <div>Location: ${locationBadgeHtml}</div>
            </div>

            <!-- Notification Channels Summary Grid (WhatsApp & Email 2-Card Layout) -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; text-align: center;">
                <div style="background: rgba(37, 211, 102, 0.1); border: 1px solid rgba(37, 211, 102, 0.3); border-radius: 8px; padding: 10px 8px;">
                    <div style="font-size: 0.8rem; color: #25D366; font-weight: 600;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: #ffffff; margin-top: 4px;">
                        ${getWAOverview(wa)}
                    </div>
                </div>
                <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 10px 8px;">
                    <div style="font-size: 0.8rem; color: #f59e0b; font-weight: 600;"><i class="fa-solid fa-envelope"></i> Email</div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: #ffffff; margin-top: 4px;">
                        ${getEmailOverview(email)}
                    </div>
                </div>
            </div>

            <!-- Evidence & Tracking Status (Requirement 12) -->
            <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.82rem; color: #cbd5e1; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
                <div><i class="fa-solid fa-satellite-dish" style="color:#a855f7; width:16px;"></i> Live Tracking: <span id="sos-tracking-status" style="color:#10b981; font-weight:700;"><i class="fa-solid fa-circle-dot fa-fade"></i> Active</span></div>
                <div><i class="fa-solid fa-camera" style="color:#38bdf8; width:16px;"></i> Photo Evidence: <span id="sos-photo-status" style="color:#f59e0b; font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> Initializing...</span></div>
                <div><i class="fa-solid fa-microphone" style="color:#ec4899; width:16px;"></i> Audio Evidence: <span id="sos-audio-status" style="color:#f59e0b; font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> Initializing...</span></div>
            </div>

            <!-- Recipient Breakdown -->
            <div style="margin-bottom: 10px;">
                <div style="font-size: 0.8rem; font-weight: 700; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Emergency Contacts Dispatch Status:
                </div>
                ${contactsHtml}
            </div>

            <!-- Action Buttons -->
            <div style="margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px;">
                <button id="btn-retry-alerts" type="button" onclick="handleRetrySOSAlerts('${emergencyId}')" class="btn btn-sm btn-secondary" style="flex: 1; min-width: 150px; padding: 8px 12px; font-size: 0.82rem; font-weight: 600; cursor: pointer;">
                    <i class="fa-solid fa-arrows-rotate"></i> Retry Alerts (Anti-Spam Guard)
                </button>
                <a href="${data.trackingUrl || ('tracking.html?id=' + emergencyId)}" target="_blank" class="btn btn-sm" style="flex: 1; min-width: 150px; padding: 8px 12px; font-size: 0.82rem; font-weight: 600; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #a855f7; border-radius: 6px; text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Live Tracking
                </a>
            </div>
        </div>
    `;
}

// Get Best GPS Location with Graceful Fallback (Requirement 3)
function getEmergencyLocation() {
    return new Promise((resolve) => {
        // FAST PATH: If current location is already known & recent, resolve instantly
        if (window.currentLat && window.currentLng && window.locationTimestamp && (Date.now() - window.locationTimestamp < 60000)) {
            return resolve({
                latitude: window.currentLat,
                longitude: window.currentLng,
                accuracy: window.currentAccuracy || 10,
                locationStatus: 'acquired',
                timestamp: new Date().toISOString()
            });
        }

        if (!("geolocation" in navigator)) {
            console.warn("Geolocation not supported by browser.");
            return resolve({
                latitude: window.currentLat || null,
                longitude: window.currentLng || null,
                accuracy: null,
                locationStatus: window.currentLat ? 'last_known' : 'unavailable',
                timestamp: new Date().toISOString()
            });
        }

        let settled = false;
        const done = (loc) => {
            if (!settled) {
                settled = true;
                resolve(loc);
            }
        };

        // Aggressive 2.5s timeout so emergency notifications are NEVER stalled by slow GPS
        const timer = setTimeout(() => {
            if (window.currentLat && window.currentLng) {
                done({
                    latitude: window.currentLat,
                    longitude: window.currentLng,
                    accuracy: window.currentAccuracy || null,
                    locationStatus: 'last_known',
                    timestamp: new Date().toISOString()
                });
            } else {
                done({
                    latitude: null,
                    longitude: null,
                    accuracy: null,
                    locationStatus: 'unavailable',
                    timestamp: new Date().toISOString()
                });
            }
        }, 2500);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                clearTimeout(timer);
                window.currentLat = pos.coords.latitude;
                window.currentLng = pos.coords.longitude;
                window.currentAccuracy = pos.coords.accuracy;
                window.locationTimestamp = Date.now();
                done({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    locationStatus: 'acquired',
                    timestamp: new Date().toISOString()
                });
            },
            (err) => {
                clearTimeout(timer);
                console.warn("Geolocation lookup error:", err.message);
                if (window.currentLat && window.currentLng) {
                    done({
                        latitude: window.currentLat,
                        longitude: window.currentLng,
                        accuracy: window.currentAccuracy || null,
                        locationStatus: 'last_known',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    done({
                        latitude: null,
                        longitude: null,
                        accuracy: null,
                        locationStatus: 'unavailable',
                        timestamp: new Date().toISOString()
                    });
                }
            },
            { enableHighAccuracy: true, timeout: 2500, maximumAge: 30000 }
        );
    });
}

// SOS Trigger Entry Point (Called on SOS Button Click or Voice Trigger)
function triggerSOSWorkflow() {
    if (window.isSosActive) {
        showToast("SOS emergency is already active! Location updates are being transmitted.", "info");
        return;
    }

    const countdownBox = document.getElementById('sos-countdown-container');
    const secondsSpan = document.getElementById('sos-countdown-seconds');

    // If countdown is already ticking, second click activates immediately!
    if (sosCountdownTimer) {
        dispatchSOSNow();
        return;
    }

    // Start 3-second safety countdown to prevent accidental triggers (Requirement 2)
    sosCountdownSeconds = 3;
    if (secondsSpan) secondsSpan.textContent = String(sosCountdownSeconds);
    if (countdownBox) countdownBox.style.display = 'block';

    sosCountdownTimer = setInterval(() => {
        sosCountdownSeconds--;
        if (secondsSpan) secondsSpan.textContent = String(sosCountdownSeconds);

        if (sosCountdownSeconds <= 0) {
            clearInterval(sosCountdownTimer);
            sosCountdownTimer = null;
            if (countdownBox) countdownBox.style.display = 'none';
            dispatchSOSNow();
        }
    }, 1000);
}

// User cancels countdown (False alarm)
function cancelSOSCountdown() {
    if (sosCountdownTimer) {
        clearInterval(sosCountdownTimer);
        sosCountdownTimer = null;
    }
    const countdownBox = document.getElementById('sos-countdown-container');
    if (countdownBox) countdownBox.style.display = 'none';
    showToast("SOS alert cancelled (False alarm).", "info");
}

// Full Emergency SOS Dispatch
async function dispatchSOSNow() {
    if (sosCountdownTimer) {
        clearInterval(sosCountdownTimer);
        sosCountdownTimer = null;
    }
    const countdownBox = document.getElementById('sos-countdown-container');
    if (countdownBox) countdownBox.style.display = 'none';

    if (window.isSosActive) return;
    window.isSosActive = true;

    const sosBtn = document.getElementById('sos-btn');
    const sosStatus = document.getElementById('sos-status');

    if (sosBtn) {
        sosBtn.classList.add('loading');
        sosBtn.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i></span>';
    }

    const authToken = (typeof currentToken !== 'undefined' && currentToken) || localStorage.getItem('token');
    if (!authToken) {
        showToast("Please log in first to activate emergency alerts.", "error");
        resetSOSState(true);
        return;
    }

    if (sosStatus) {
        sosStatus.innerHTML = `
            <div style="background: rgba(15, 23, 42, 0.9); border: 2px solid #ef4444; border-radius: 14px; padding: 16px; margin-top: 14px; text-align: left; box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);">
                <div style="color: #ef4444; font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ef4444;animation:pulse 1s infinite;"></span>
                    EMERGENCY IN PROGRESS
                </div>
                <div style="margin-top: 10px; font-size: 0.88rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                    <div><i class="fa-solid fa-location-crosshairs fa-fade" style="color: #38bdf8; width: 18px;"></i> Acquiring GPS coordinates...</div>
                    <div><i class="fa-solid fa-camera fa-fade" style="color: #a855f7; width: 18px;"></i> Capturing camera evidence photo...</div>
                    <div><i class="fa-solid fa-microphone-lines fa-beat" style="color: #ec4899; width: 18px;"></i> <strong id="sos-audio-countdown-label">Recording 5-second ambient voice note (5s remaining)...</strong></div>
                </div>
            </div>
        `;
    }

    try {
        // 1. Obtain GPS coordinates and Capture Evidence (Photo & 5s Audio) concurrently
        const locationPromise = getEmergencyLocation().catch(() => ({
            latitude: window.currentLat || null,
            longitude: window.currentLng || null,
            accuracy: window.currentAccuracy || null,
            locationStatus: window.currentLat ? 'last_known' : 'unavailable'
        }));

        const captureFn = (typeof window.captureSOSEvidence === 'function')
            ? window.captureSOSEvidence
            : (typeof captureSOSEvidence === 'function' ? captureSOSEvidence : null);

        const onCountdownTick = (remainingSec) => {
            const labelEl = document.getElementById('sos-audio-countdown-label');
            if (labelEl) {
                labelEl.textContent = `Recording 5-second ambient voice note (${remainingSec}s remaining)...`;
            }
        };

        const evidencePromise = captureFn
            ? captureFn(5000, onCountdownTick).catch(err => {
                console.warn("Evidence capture notice:", err);
                return { evidence: null, audio: null };
            })
            : Promise.resolve({ evidence: null, audio: null });

        // Await both GPS and Evidence capture concurrently (~5 seconds total)
        const [posData, evResult] = await Promise.all([locationPromise, evidencePromise]);

        if (posData.locationStatus === 'last_known') {
            showToast("GPS timed out. Dispatching SOS with last known location.", "warning");
        } else if (posData.locationStatus === 'unavailable') {
            showToast("GPS location unavailable. Dispatching SOS without coordinates.", "warning");
        }

        if (posData.latitude && posData.longitude && typeof updateMapPosition === 'function') {
            try { updateMapPosition(posData.latitude, posData.longitude); } catch(e) {}
        }

        const labelEl = document.getElementById('sos-audio-countdown-label');
        if (labelEl) {
            labelEl.innerHTML = `<span style="color:#10b981;"><i class="fa-solid fa-check"></i> Evidence recorded. Dispatching distress alerts...</span>`;
        }

        const payload = {
            latitude: posData.latitude,
            longitude: posData.longitude,
            accuracy: posData.accuracy,
            locationStatus: posData.locationStatus,
            evidence: evResult.evidence || null,
            audio: evResult.audio || null,
            audioDurationSeconds: 5,
            videoActive: true
        };

        // 2. Dispatch Emergency Distress Alert to Backend with all evidence bundled
        const responseData = await api.triggerSOS(payload, authToken);
        window.activeEmergencyId = responseData.emergencyId;

        showToast(responseData.msg || "EMERGENCY SOS ALERT ACTIVATED!", "success");

        if (sosBtn) {
            sosBtn.classList.remove('loading');
            sosBtn.innerHTML = '<span>SOS</span>';
        }

        // 3. Render Real-Time Notification Status Dashboard
        renderNotificationDashboard(responseData);
        startStatusPolling(responseData.emergencyId);

        // 4. Update Evidence Badges immediately based on captured evidence
        if (evResult.evidence) {
            updateEvidenceStatusBadge('photo', 'uploaded', 'Photo Captured & Uploaded');
        } else {
            updateEvidenceStatusBadge('photo', 'permission_denied', 'Camera permission denied or camera unavailable');
        }

        if (evResult.audio) {
            updateEvidenceStatusBadge('audio', 'uploaded', '5s Voice Note Recorded & Attached');
        } else {
            updateEvidenceStatusBadge('audio', 'permission_denied', 'Microphone permission denied or unsupported');
        }

        // 5. Start Live GPS Tracking Loop (every 10s)
        startLiveTrackingWatcher(responseData.emergencyId, authToken);

        // 6. Secondary fallback sync if evidence was not captured initially
        if (!evResult.evidence && !evResult.audio) {
            captureAndSyncEvidence(responseData.emergencyId, authToken);
        }

    } catch (err) {
        console.error("SOS Activation Error:", err);
        showToast(err.message, "error");
        resetSOSState(true);
        if (sosStatus) {
            sosStatus.innerHTML = `<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 10px; padding: 12px; margin-top: 10px; color: #f87171; text-align: left; font-size: 0.88rem;"><i class="fa-solid fa-circle-exclamation"></i> <strong>SOS Activation Notice:</strong> ${err.message}</div>`;
        }
    }
}

// Start Live GPS Tracking Updates
function startLiveTrackingWatcher(emergencyId, token) {
    if (window.watchId) clearInterval(window.watchId);

    window.watchId = setInterval(async () => {
        if (!window.isSosActive || !window.activeEmergencyId) {
            if (window.watchId) clearInterval(window.watchId);
            window.watchId = null;
            return;
        }

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                window.currentLat = pos.coords.latitude;
                window.currentLng = pos.coords.longitude;
                window.currentAccuracy = pos.coords.accuracy;
                window.locationTimestamp = Date.now();

                if (typeof updateMapPosition === 'function') {
                    updateMapPosition(window.currentLat, window.currentLng);
                }

                if (token && window.activeEmergencyId) {
                    try {
                        await api.updateLiveLocation(window.activeEmergencyId, {
                            latitude: window.currentLat,
                            longitude: window.currentLng,
                            accuracy: window.currentAccuracy
                        }, token);
                    } catch (trackErr) {
                        // Silent update catch
                    }
                }
            }, () => {}, { enableHighAccuracy: true });
        }
    }, 10000);
}

// Background Photo & Audio Evidence Capture
async function captureAndSyncEvidence(emergencyId, token) {
    updateEvidenceStatusBadge('photo', 'recording', 'Accessing camera...');
    updateEvidenceStatusBadge('audio', 'recording', 'Recording 5s ambient voice note...');

    try {
        const captureFn = (typeof window.captureSOSEvidence === 'function')
            ? window.captureSOSEvidence
            : (typeof captureSOSEvidence === 'function' ? captureSOSEvidence : null);

        if (captureFn) {
            const evResult = await captureFn(5000);

            if (evResult.evidence) {
                updateEvidenceStatusBadge('photo', 'uploading', 'Uploading photo...');
            } else {
                updateEvidenceStatusBadge('photo', 'permission_denied', 'Camera permission denied or camera unavailable');
            }

            if (evResult.audio) {
                updateEvidenceStatusBadge('audio', 'uploading', 'Uploading voice note...');
            } else {
                updateEvidenceStatusBadge('audio', 'permission_denied', 'Microphone permission denied or unsupported');
            }

            if ((evResult.evidence || evResult.audio) && token && emergencyId) {
                await api.uploadEvidenceToSOS(emergencyId, {
                    evidence: evResult.evidence,
                    audio: evResult.audio,
                    audioDurationSeconds: 5
                }, token);

                if (evResult.evidence) updateEvidenceStatusBadge('photo', 'uploaded', 'Uploaded & Secured');
                if (evResult.audio) updateEvidenceStatusBadge('audio', 'uploaded', 'Uploaded & Secured');
            }
        }
    } catch (e) {
        console.warn("Evidence sync notice:", e.message);
        updateEvidenceStatusBadge('photo', 'failed', e.message);
        updateEvidenceStatusBadge('audio', 'failed', e.message);
    }
}

// End Emergency / I Am Safe (Requirement 13)
async function endActiveEmergency() {
    if (!confirm('Are you safe now? This will mark the active SOS emergency as RESOLVED and stop location tracking.')) return;

    try {
        const tok = (typeof currentToken !== 'undefined' && currentToken) || localStorage.getItem('token');
        if (tok) {
            await api.endEmergency(window.activeEmergencyId, tok);
        }

        showToast('Emergency session successfully resolved. Glad you are safe!', 'success');
        resetSOSState(false, true);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Reset SOS State & Stop Hardware Streams (Requirement 13)
function resetSOSState(isError = false, isResolved = false) {
    window.isSosActive = false;
    window.activeEmergencyId = null;

    if (sosCountdownTimer) {
        clearInterval(sosCountdownTimer);
        sosCountdownTimer = null;
    }

    if (window.watchId) {
        clearInterval(window.watchId);
        window.watchId = null;
    }

    if (window.statusPollingInterval) {
        clearInterval(window.statusPollingInterval);
        window.statusPollingInterval = null;
    }

    const sosBtn = document.getElementById('sos-btn');
    if (sosBtn) {
        sosBtn.classList.remove('loading');
        sosBtn.innerHTML = '<span>SOS</span>';
    }

    const countdownBox = document.getElementById('sos-countdown-container');
    if (countdownBox) countdownBox.style.display = 'none';

    const sosStatus = document.getElementById('sos-status');
    if (sosStatus) {
        if (isResolved) {
            sosStatus.innerHTML = `
                <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 10px; padding: 12px; margin-top: 10px; color: #10b981; font-weight: 600;">
                    <i class="fa-solid fa-circle-check"></i> Emergency session ended. Status: RESOLVED.
                </div>
            `;
        } else if (isError) {
            sosStatus.innerHTML = '<span style="color:var(--danger)">Alert Failed. Please check network/login and try again.</span>';
        } else {
            sosStatus.innerHTML = '';
        }
    }
}

// Handler to safely retry failed alerts with 30s retry protection
async function handleRetrySOSAlerts(emergencyId) {
    const btn = document.getElementById('btn-retry-alerts');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Retrying...';
    }

    try {
        const tok = (typeof currentToken !== 'undefined' && currentToken) || localStorage.getItem('token');
        const res = await api.retrySOSAlerts(emergencyId, tok);
        showToast(res.msg || 'Alerts retry completed', 'success');
        renderNotificationDashboard(res);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Retry Alerts';
        }
    }
}

// Poll live delivery updates
function startStatusPolling(emergencyId) {
    if (window.statusPollingInterval) clearInterval(window.statusPollingInterval);
    window.statusPollingInterval = setInterval(async () => {
        if (!window.isSosActive) {
            clearInterval(window.statusPollingInterval);
            window.statusPollingInterval = null;
            return;
        }
        try {
            const tok = (typeof currentToken !== 'undefined' && currentToken) || localStorage.getItem('token');
            if (!tok) return;
            const statusData = await api.getSOSStatus(emergencyId, tok);
            if (statusData && !statusData.active) {
                resetSOSState(false, true);
            }
        } catch (e) {
            // silent poll error
        }
    }, 12000);
}

// Backward Compatibility Aliases
function activateSOS() { triggerSOSWorkflow(); }
function resolveEmergencyAlert() { endActiveEmergency(); }

// Leaflet Map Initialization
function initMap() {
    if (!document.getElementById('map')) return;
    const defaultLoc = [13.0827, 80.2707]; // Chennai default or user coords
    
    if (!map && typeof L !== 'undefined') {
        map = L.map('map').setView(defaultLoc, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        alertsLayer = L.layerGroup().addTo(map);

        // Load overlay data
        loadCommunityAlerts();
        
        if (!pollingId) {
            pollingId = setInterval(loadCommunityAlerts, 15000);
        }
    }
    
    setTimeout(() => {
        if (map) map.invalidateSize();
        refreshLocation();
    }, 300);
}

function refreshLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
            window.currentLat = pos.coords.latitude;
            window.currentLng = pos.coords.longitude;
            window.currentAccuracy = pos.coords.accuracy;
            window.locationTimestamp = Date.now();
            updateMapPosition(window.currentLat, window.currentLng);
            findNearbyHelp(window.currentLat, window.currentLng);
        }, (err) => {
            console.warn("Geolocation refresh error:", err.message);
        }, { enableHighAccuracy: true });
    }
}

function updateMapPosition(lat, lng) {
    window.currentLat = lat;
    window.currentLng = lng;
    if (!map || typeof L === 'undefined') return;
    if (marker) {
        try { map.removeLayer(marker); } catch(e) {}
    }
    
    const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="background:var(--primary);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 15px rgba(248,58,89,0.8);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
    
    marker = L.marker([lat, lng], {icon: userIcon, zIndexOffset: 1000}).addTo(map);
    marker.bindPopup("<b>You are here</b><br/>Current Location").openPopup();
    map.setView([lat, lng], 15);
}

function findNearbyHelp(lat, lng) {
    if (!map || typeof L === 'undefined') return;
    helpMarkers.forEach(m => {
        try { map.removeLayer(m); } catch(e) {}
    });
    helpMarkers = [];

    const policeIcon = L.divIcon({
        className: 'help-marker',
        html: '<div style="background:#3b82f6;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 10px rgba(59,130,246,0.6);"><i class="fa-solid fa-building-shield"></i></div>',
        iconSize: [24, 24], iconAnchor: [12, 12]
    });

    const hospitalIcon = L.divIcon({
        className: 'help-marker',
        html: '<div style="background:#10b981;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 10px rgba(16,185,129,0.6);"><i class="fa-solid fa-hospital"></i></div>',
        iconSize: [24, 24], iconAnchor: [12, 12]
    });

    const policeMarker = L.marker([lat + 0.003, lng + 0.003], {icon: policeIcon}).addTo(map)
        .bindPopup(`<b>City Police Station</b><br/>0.5 km away<br/><button class='btn btn-sm btn-primary' style='margin-top:5px;padding:3px 8px;' onclick='routeTo([${lat + 0.003}, ${lng + 0.003}])'>Directions</button>`);
    
    const hospitalMarker = L.marker([lat - 0.004, lng + 0.002], {icon: hospitalIcon}).addTo(map)
        .bindPopup(`<b>General Hospital</b><br/>0.8 km away<br/><button class='btn btn-sm btn-primary' style='margin-top:5px;padding:3px 8px;' onclick='routeTo([${lat - 0.004}, ${lng + 0.002}])'>Directions</button>`);
    
    helpMarkers.push(policeMarker, hospitalMarker);
}

// Voice Command Trigger (HELP)
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (window.SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        
        console.log("Heard voice command:", command);
        if ((command.includes('help') || command.includes('emergency')) && !window.isSosActive) {
            showToast("Voice command detected: Triggering SOS!", "error");
            triggerSOSWorkflow();
        }
    };
    
    recognition.onend = () => {
        const tok = (typeof currentToken !== 'undefined' && currentToken) || localStorage.getItem('token');
        if (tok) {
            try { recognition.start(); } catch(e) {}
        }
    };
    
    const originalInitMap = initMap;
    initMap = function() {
        originalInitMap();
        try { recognition.start(); } catch(e) {}
    };
}

async function loadCommunityAlerts() {
    const tok = (typeof currentToken !== 'undefined' && currentToken) || localStorage.getItem('token');
    if (!tok || !alertsLayer || typeof L === 'undefined') return;
    try {
        const alerts = await api.getActiveAlerts();
        alertsLayer.clearLayers();
        
        const alertIcon = L.divIcon({
            className: 'alert-pulse-marker',
            html: '<div style="background:red;width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 20px rgba(255,0,0,0.9); animation: pulse 1s infinite;"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        alerts.forEach(a => {
            if (a.latitude && a.longitude) {
                L.marker([a.latitude, a.longitude], {icon: alertIcon, zIndexOffset: 999})
                 .bindPopup(`<b style="color:red;">ACTIVE SOS ALERT</b><br/>User: ${a.user?.name || 'Nearby Person'}`)
                 .addTo(alertsLayer);
            }
        });
    } catch(err) {
        // silent community alerts error
    }
}

function routeTo(destCoords) {
    if (!marker) return showToast("Cannot find your current location", "error");
    if (!map || typeof L === 'undefined' || !L.Routing) return;
    
    if (routingControl) {
        map.removeControl(routingControl);
    }
    
    const userLoc = marker.getLatLng();
    
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(userLoc.lat, userLoc.lng),
            L.latLng(destCoords[0], destCoords[1])
        ],
        lineOptions: {
            styles: [{color: '#10b981', opacity: 1, weight: 6}]
        },
        createMarker: function() { return null; },
        fitSelectedRoutes: true,
        show: true
    }).addTo(map);
    
    showToast("Calculating safe route...", "success");
}

// Attach event listener to SOS button when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const sosBtn = document.getElementById('sos-btn');
    if (sosBtn) {
        sosBtn.addEventListener('click', triggerSOSWorkflow);
    }
});

let map;
let marker;
let helpMarkers = [];
let alertsLayer;
let routingControl;
let pollingId;

let watchId;
let isSosActive = false;

function initMap() {
    if(!document.getElementById('map')) return;
    
    // Default fallback location (London) if permission denied
    const defaultLoc = [51.505, -0.09];
    
    if(!map) {
        map = L.map('map').setView(defaultLoc, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        alertsLayer = L.layerGroup().addTo(map);

        // Load overlay data
        loadCommunityAlerts();
        
        // Poll for active alerts
        if(!pollingId) {
            pollingId = setInterval(loadCommunityAlerts, 15000);
        }
    }
    
    // Use timeout to ensure map container has final size before refreshing
    setTimeout(() => {
        map.invalidateSize();
        refreshLocation();
    }, 300);
}

function refreshLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            updateMapPosition(lat, lng);
            findNearbyHelp(lat, lng);
        }, (err) => {
            console.error("Geolocation error:", err);
            showToast("Could not access location. Please enable location services in your browser.", "error");
        }, { enableHighAccuracy: true });
    } else {
        showToast("Geolocation is not supported by your browser.", "error");
    }
}

function updateMapPosition(lat, lng) {
    if(marker) {
        map.removeLayer(marker);
    }
    
    // Custom pulsing icon for user
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
    // Clean old markers
    helpMarkers.forEach(m => map.removeLayer(m));
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

    // Mocking nearby help markers for demo
    const policeMarker = L.marker([lat + 0.003, lng + 0.003], {icon: policeIcon}).addTo(map)
        .bindPopup(`<b>City Police Station</b><br/>0.5 km away<br/><button class='btn btn-sm btn-primary' style='margin-top:5px;padding:3px 8px;' onclick='routeTo([${lat + 0.003}, ${lng + 0.003}])'>Directions</button>`);
    
    const hospitalMarker = L.marker([lat - 0.004, lng + 0.002], {icon: hospitalIcon}).addTo(map)
        .bindPopup(`<b>General Hospital</b><br/>0.8 km away<br/><button class='btn btn-sm btn-primary' style='margin-top:5px;padding:3px 8px;' onclick='routeTo([${lat - 0.004}, ${lng + 0.002}])'>Directions</button>`);
    
    helpMarkers.push(policeMarker, hospitalMarker);
}

// SOS Logic
const sosBtn = document.getElementById('sos-btn');
const sosStatus = document.getElementById('sos-status');

if(sosBtn) {
    sosBtn.addEventListener('click', activateSOS);
}

async function activateSOS() {
    if(isSosActive) return;
    
    isSosActive = true;
    sosBtn.classList.add('loading');
    sosBtn.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i></span>';
    sosStatus.innerHTML = '<span style="color:var(--primary)"><i class="fa-solid fa-satellite-dish fa-beat"></i> Connecting & Fetching Location...</span>';

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const location = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
            };
            
            updateMapPosition(pos.coords.latitude, pos.coords.longitude);
            
            try {
                sosStatus.innerHTML = '<span style="color:var(--primary)"><i class="fa-solid fa-camera fa-beat"></i> Capturing Evidence...</span>';
                
                // Await camera up to 8 seconds
                if(typeof captureEvidence === 'function') {
                    const evidencePromise = captureEvidence();
                    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 8000));
                    const evidenceBase64 = await Promise.race([evidencePromise, timeoutPromise]);
                    if(evidenceBase64) {
                        location.evidence = evidenceBase64;
                    } else {
                        console.warn("Camera capture timed out or failed.");
                    }
                }

                sosStatus.innerHTML = '<span style="color:var(--primary)"><i class="fa-solid fa-paper-plane fa-beat"></i> Sending Alerts to Contacts...</span>';
                const responseData = await api.triggerSOS(location, currentToken);
                
                showToast(responseData.msg || "SOS Alert processed successfully!", "success");
                sosBtn.classList.remove('loading');
                sosBtn.innerHTML = '<span>SOS</span>';
                sosStatus.innerHTML = '<span style="color:var(--success); font-weight:600;"><i class="fa-solid fa-check-circle"></i> Emergency contacts notified</span><br/><span style="font-size:0.8rem;color:var(--text-muted)">Tracking active.</span>';
                
                // Keep updating location periodically during SOS
                if(!watchId) {
                    watchId = setInterval(() => {
                        refreshLocation();
                    }, 10000);
                }
                
                // Auto-stop tracking after 3 mins for demo to conserve battery
                setTimeout(() => {
                    resetSOSState();
                }, 180000);

            } catch (err) {
                showToast(err.message, "error");
                resetSOSState(true);
            }
        }, err => {
            showToast("Failed to retrieve location. Alerts not sent.", "error");
            resetSOSState(true);
        }, { enableHighAccuracy: true });
    } else {
        showToast("Geolocation not supported.", "error");
        resetSOSState(true);
    }
}

function resetSOSState(isError = false) {
    isSosActive = false;
    sosBtn.classList.remove('loading');
    sosBtn.innerHTML = '<span>SOS</span>';
    sosStatus.innerHTML = isError ? '<span style="color:var(--danger)">Alert Failed. Try again.</span>' : '';
    if(watchId) {
        clearInterval(watchId);
        watchId = null;
    }
}

// Voice Command Trigger (HELP)
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if(window.SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        
        console.log("Heard:", command);
        if((command.includes('help') || command.includes('emergency')) && currentToken && !isSosActive) {
            showToast("Voice command detected: Triggering SOS!", "error");
            activateSOS();
        }
    };
    
    // Automatically restart recognition when it stops
    recognition.onend = () => {
        if(currentToken) {
            try { recognition.start(); } catch(e) { console.log('Speech restart error', e); }
        }
    };
    
    // Start listening once map is initialized (user logged in)
    const originalInitMap = initMap;
    initMap = function() {
        originalInitMap();
        try { recognition.start(); console.log('Voice recognition started.'); } catch(e) {}
    }
} else {
    console.log("Speech Recognition not supported in this browser.");
}

// --- Advanced Features ---

async function loadCommunityAlerts() {
    if(!currentToken) return; // Only for logged in users
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
            // Don't show our own alert marker twice if we are active
            if(currentUser && a.user._id === currentUser._id) return;

            L.marker([a.latitude, a.longitude], {icon: alertIcon, zIndexOffset: 999})
             .bindPopup(`<b style="color:red;">ACTIVE SOS ALERT</b><br/>User: ${a.user.name || 'Nearby Person'}`)
             .addTo(alertsLayer);
        });
    } catch(err) {
        console.error("Failed to load community alerts", err);
    }
}

function routeTo(destCoords) {
    if(!marker) return showToast("Cannot find your current location", "error");
    
    if(routingControl) {
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
        createMarker: function() { return null; }, // hide duplicate markers
        fitSelectedRoutes: true,
        show: true
    }).addTo(map);
    
    showToast("Calculating safe route...", "success");
}

// Ensure alerts are cleared locally on reset
const originalResetSOS = resetSOSState;
resetSOSState = function(isError) {
    originalResetSOS(isError);
    if(currentToken) {
        api.resolveAlerts(currentToken).catch(e => console.error(e));
    }
}

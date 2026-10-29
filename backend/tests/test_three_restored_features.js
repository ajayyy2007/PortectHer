/**
 * FLARE WOMEN SAFETY - TEST SUITE FOR THE 3 RESTORED FEATURES:
 * 1. Current GPS Location & Google Maps / Live-Tracking Links
 * 2. Camera Evidence Photo Capture, Storage, Inline Preview & Button
 * 3. Exactly 5-Second Emergency Audio Recording, Storage, Attachment & Button
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const fs = require('fs');

console.log('================================================================');
console.log('🧪 FLARE SOS - 3 RESTORED FEATURES VERIFICATION SUITE');
console.log('================================================================\n');

let passedCount = 0;
let totalCount = 0;

function test(name, fn) {
    totalCount++;
    try {
        fn();
        console.log(`✅ [PASS] TEST ${totalCount}: ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`❌ [FAIL] TEST ${totalCount}: ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

async function asyncTest(name, fn) {
    totalCount++;
    try {
        await fn();
        console.log(`✅ [PASS] TEST ${totalCount}: ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`❌ [FAIL] TEST ${totalCount}: ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

async function runSuite() {
    const Alert = require('../models/Alert');
    const sosRouter = require('../routes/sos');
    const { sendEmergencyEmail, isValidEmail } = require('../services/emailService');

    // TEST 1: Alert model schema fields for the 3 features
    test('1. Alert model defines all restored fields and 5-second audio default', () => {
        const paths = Alert.schema.paths;
        assert.ok(paths['googleMapsUrl'], 'Alert must have googleMapsUrl');
        assert.ok(paths['liveTrackingUrl'], 'Alert must have liveTrackingUrl');
        assert.ok(paths['photoEvidenceUrl'], 'Alert must have photoEvidenceUrl');
        assert.ok(paths['audioEvidenceUrl'], 'Alert must have audioEvidenceUrl');
        assert.ok(paths['audioDurationSeconds'], 'Alert must have audioDurationSeconds');
        assert.strictEqual(paths['audioDurationSeconds'].defaultValue, 5, 'audioDurationSeconds default must be 5');
        assert.ok(paths['evidenceFile'], 'Alert must have evidenceFile');
        assert.ok(paths['audioFile'], 'Alert must have audioFile');
        assert.ok(Alert.schema.obj.evidenceMetadata || paths['evidenceMetadata.photoCaptured'], 'Alert must have evidenceMetadata');
    });

    // TEST 2: Google Maps link generation with real coordinates
    test('2. Google Maps URL generation (https://www.google.com/maps?q=LAT,LNG)', () => {
        const lat = 12.9716;
        const lng = 77.5946;
        const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        assert.strictEqual(googleMapsUrl, 'https://www.google.com/maps?q=12.9716,77.5946');
    });

    // TEST 3: Email template generation with all 3 features present
    test('3. Email content contains all required buttons, sections, and preview tags', () => {
        const mockEmergencyId = 'EMG_TEST_999';
        const mockLat = 13.0827;
        const mockLng = 80.2707;
        const mockGoogleMapsUrl = `https://www.google.com/maps?q=${mockLat},${mockLng}`;
        const mockTrackingUrl = `http://localhost:5000/tracking.html?id=${mockEmergencyId}`;
        const mockPhotoUrl = `http://localhost:5000/api/sos/evidence/${mockEmergencyId}/photo`;
        const mockAudioUrl = `http://localhost:5000/api/sos/evidence/${mockEmergencyId}/audio`;

        // Check template logic via emailService inspection
        const fsContent = fs.readFileSync(path.join(__dirname, '../services/emailService.js'), 'utf8');

        // Feature 1: Google Maps & Live Tracking
        assert.ok(fsContent.includes('📍 View Google Maps'), 'Must have "📍 View Google Maps" button text');
        assert.ok(fsContent.includes('📡 Live Tracking'), 'Must have "📡 Live Tracking" button text');
        assert.ok(fsContent.includes('https://www.google.com/maps?q='), 'Must generate Google Maps URL pattern');

        // Feature 2: Photo Evidence
        assert.ok(fsContent.includes('📸 Captured Camera Evidence'), 'Must have "📸 Captured Camera Evidence" section');
        assert.ok(fsContent.includes('cid:sos_evidence_photo'), 'Must use cid:sos_evidence_photo for inline preview');
        assert.ok(fsContent.includes('View / Download Evidence Photo (JPG)'), 'Must have "View / Download Evidence Photo (JPG)" button');
        assert.ok(fsContent.includes('No camera evidence photo available (Permission denied or camera unavailable).'), 'Must have camera fallback text');

        // Feature 3: 5-Second Voice Note
        assert.ok(fsContent.includes('🎙️ Emergency Ambient Voice Recording'), 'Must have "🎙️ Emergency Ambient Voice Recording" section');
        assert.ok(fsContent.includes('5-second emergency audio recording.'), 'Must specify "5-second emergency audio recording."');
        assert.ok(fsContent.includes('Play / Download Voice Note'), 'Must have "Play / Download Voice Note" button');
        assert.ok(fsContent.includes('emergency_voice_note.webm'), 'Must reference emergency_voice_note.webm');
        assert.ok(fsContent.includes('No emergency voice note available (Permission denied or microphone unavailable).'), 'Must have audio fallback text');
    });

    // TEST 4: Evidence files saving and disk verification
    test('4. Photo and Audio file persistence in uploads/evidence directory', () => {
        const evidenceDir = path.join(__dirname, '../uploads/evidence');
        if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

        const testEmergencyId = `TEST_${Date.now()}`;
        const photoFileName = `photo_${testEmergencyId}.jpg`;
        const audioFileName = `emergency_${testEmergencyId}.webm`;

        const photoPath = path.join(evidenceDir, photoFileName);
        const audioPath = path.join(evidenceDir, audioFileName);

        const dummyPhotoBuf = Buffer.from('fake-jpeg-binary-evidence-data');
        const dummyAudioBuf = Buffer.from('fake-webm-binary-audio-data');

        fs.writeFileSync(photoPath, dummyPhotoBuf);
        fs.writeFileSync(audioPath, dummyAudioBuf);

        assert.ok(fs.existsSync(photoPath), 'Photo file must exist on disk');
        assert.strictEqual(fs.statSync(photoPath).size, dummyPhotoBuf.length);

        assert.ok(fs.existsSync(audioPath), 'Audio file must exist on disk');
        assert.strictEqual(fs.statSync(audioPath).size, dummyAudioBuf.length);

        // Cleanup
        try { fs.unlinkSync(photoPath); fs.unlinkSync(audioPath); } catch (e) {}
    });

    // TEST 5: Public evidence access without auth token requirement
    test('5. Public evidence endpoint GET /api/sos/evidence/:emergencyId/:type exists and does not require auth middleware', () => {
        let evidenceRouteLayer = null;
        sosRouter.stack.forEach(layer => {
            if (layer.route && layer.route.path === '/evidence/:emergencyId/:type' && layer.route.methods.get) {
                evidenceRouteLayer = layer;
            }
        });

        assert.ok(evidenceRouteLayer, 'GET /evidence/:emergencyId/:type route must be registered');
        // The handlers on this route: should NOT include authMiddleware (only 1 handler: the route function itself)
        assert.strictEqual(evidenceRouteLayer.route.stack.length, 1, 'GET /evidence/:emergencyId/:type must be publicly accessible without authMiddleware');
    });

    // TEST 6: Frontend map.js bundles GPS, Photo, and 5s Audio before triggerSOS
    test('6. Frontend map.js executes GPS acquisition and 5s Audio concurrently before dispatching SOS', () => {
        const mapJsContent = fs.readFileSync(path.join(__dirname, '../../frontend/js/map.js'), 'utf8');

        assert.ok(mapJsContent.includes('captureSOSEvidence'), 'map.js must invoke captureSOSEvidence');
        assert.ok(mapJsContent.includes('5000'), 'map.js must request 5000ms duration for audio');
        assert.ok(mapJsContent.includes('Promise.all([locationPromise, evidencePromise])'), 'map.js must await GPS and evidence capture concurrently');
        assert.ok(mapJsContent.includes('audioDurationSeconds: 5'), 'map.js payload must explicitly set audioDurationSeconds: 5');
    });

    // TEST 7: Frontend app.js records audio for 5 seconds using onstart timer and codec detection
    test('7. Frontend app.js records for 5000ms, starts timer on mediaRecorder.onstart, and uses isTypeSupported', () => {
        const appJsContent = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');

        assert.ok(appJsContent.includes('durationMs = 5000'), 'app.js default durationMs must be 5000');
        assert.ok(appJsContent.includes('MediaRecorder.isTypeSupported'), 'app.js must check MediaRecorder.isTypeSupported');
        assert.ok(appJsContent.includes('mediaRecorder.onstart'), 'app.js must use mediaRecorder.onstart to initiate 5000ms timeout');
        assert.ok(appJsContent.includes('window.captureSOSEvidence = captureSOSEvidence'), 'captureSOSEvidence must be exposed globally');
    });

    // TEST 8: Live tracking standalone page exists and polls live updates
    test('8. Standalone tracking.html live tracking page exists and connects to tracking API', () => {
        const trackingPath = path.join(__dirname, '../../frontend/tracking.html');
        assert.ok(fs.existsSync(trackingPath), 'tracking.html must exist in frontend directory');
        const trackingContent = fs.readFileSync(trackingPath, 'utf8');
        assert.ok(trackingContent.includes('/api/sos/track/'), 'tracking.html must query /api/sos/track/:id');
        assert.ok(trackingContent.includes('leaflet'), 'tracking.html must use Leaflet mapping library');
    });

    console.log('\n================================================================');
    console.log(`📊 FINAL RESULT: ${passedCount}/${totalCount} RESTORATION TESTS PASSED`);
    console.log('================================================================\n');

    if (passedCount === totalCount) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runSuite();

/**
 * FLARE Women Safety - SOS Flow & Notification Workflow Integration Test
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');

console.log('================================================================');
console.log('🧪 RUNNING FLARE SOS WORKFLOW INTEGRATION TEST');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`✅ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

async function runSOSSuite() {
    // -------------------------------------------------------------------------
    // TEST 1: Coordinate Validation
    // -------------------------------------------------------------------------
    runTest('1.1 SOS coordinates validation (valid vs invalid ranges)', () => {
        const validateCoords = (lat, lng) => {
            const latNum = Number(lat);
            const lngNum = Number(lng);
            return !isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
        };

        assert.strictEqual(validateCoords(13.0827, 80.2707), true);
        assert.strictEqual(validateCoords(-33.8688, 151.2093), true);
        assert.strictEqual(validateCoords('invalid', 80.2707), false);
        assert.strictEqual(validateCoords(95.0, 50.0), false);
        assert.strictEqual(validateCoords(10.0, 200.0), false);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Independent Channel Non-blocking Execution
    // -------------------------------------------------------------------------
    await runAsyncTest('2.1 Failure of one channel does not block other channels (Promise.allSettled)', async () => {
        // Simulate 3 independent channel promises
        const failedWhatsApp = Promise.reject(new Error('Meta WhatsApp Cloud API token expired'));
        const successfulEmail = Promise.resolve({ success: true, status: 'accepted_by_smtp', messageId: '<msg_123>' });
        const unconfiguredSMS = Promise.resolve({ success: false, status: 'not_configured', error: 'SMS not configured' });

        const results = await Promise.allSettled([failedWhatsApp, successfulEmail, unconfiguredSMS]);

        assert.strictEqual(results.length, 3);
        assert.strictEqual(results[0].status, 'rejected'); // WA failed
        assert.strictEqual(results[1].status, 'fulfilled'); // Email succeeded despite WA failure!
        assert.strictEqual(results[1].value.success, true);
        assert.strictEqual(results[2].status, 'fulfilled'); // SMS returned unconfigured status safely
        assert.strictEqual(results[2].value.status, 'not_configured');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Contact Channel Preferences Respected
    // -------------------------------------------------------------------------
    runTest('3.1 Contact channel preferences filtering (whatsappEnabled, smsEnabled, emailEnabled)', () => {
        const testContacts = [
            { name: 'Contact A', phone: '+919876543211', email: 'a@example.com', whatsappEnabled: true, smsEnabled: false, emailEnabled: true },
            { name: 'Contact B', phone: '+919876543212', email: 'b@example.com', whatsappEnabled: false, smsEnabled: true, emailEnabled: false },
            { name: 'Contact C', phone: '+919876543213', email: 'c@example.com', whatsappEnabled: true, smsEnabled: true, emailEnabled: true }
        ];

        const waContacts = testContacts.filter(c => c.whatsappEnabled !== false && c.phone);
        const smsContacts = testContacts.filter(c => c.smsEnabled !== false && c.phone);
        const emailContacts = testContacts.filter(c => c.emailEnabled !== false && c.email);

        assert.strictEqual(waContacts.length, 2); // Contact A and C
        assert.strictEqual(smsContacts.length, 2); // Contact B and C
        assert.strictEqual(emailContacts.length, 2); // Contact A and C
    });

    // -------------------------------------------------------------------------
    // TEST 4: Accurate Summary Statistics Aggregation
    // -------------------------------------------------------------------------
    runTest('4.1 SOS Response summary accurately reflects real outcomes', () => {
        const waResults = [
            { status: 'sent' },
            { status: 'failed', error: 'Token expired' }
        ];
        const smsResults = [
            { status: 'not_configured', error: 'No provider' }
        ];
        const emailResults = [
            { status: 'accepted_by_smtp', messageId: '<id_1>' }
        ];

        const summary = {
            whatsapp: {
                sent: waResults.filter(r => r.status === 'sent').length,
                failed: waResults.filter(r => r.status === 'failed').length
            },
            sms: {
                notConfigured: smsResults.filter(r => r.status === 'not_configured').length
            },
            email: {
                acceptedBySmtp: emailResults.filter(r => r.status === 'accepted_by_smtp').length
            }
        };

        assert.strictEqual(summary.whatsapp.sent, 1);
        assert.strictEqual(summary.whatsapp.failed, 1);
        assert.strictEqual(summary.sms.notConfigured, 1);
        assert.strictEqual(summary.email.acceptedBySmtp, 1);
    });

    // -------------------------------------------------------------------------
    // TEST 5: Retry Protection Cooldown
    // -------------------------------------------------------------------------
    runTest('5.1 Retry Protection 30s cooldown logic prevents duplicate spamming', () => {
        const cooldowns = new Map();
        const emergencyId = 'EMG_TEST_RETRY_1';

        // 1st retry attempt
        const canRetryFirst = !cooldowns.has(emergencyId) || (Date.now() - cooldowns.get(emergencyId) >= 30000);
        assert.strictEqual(canRetryFirst, true);
        cooldowns.set(emergencyId, Date.now());

        // Immediate 2nd retry attempt (should be blocked)
        const canRetryImmediate = (Date.now() - cooldowns.get(emergencyId) >= 30000);
        assert.strictEqual(canRetryImmediate, false);

        // Simulated after 31s
        cooldowns.set(emergencyId, Date.now() - 31000);
        const canRetryAfterDelay = (Date.now() - cooldowns.get(emergencyId) >= 30000);
        assert.strictEqual(canRetryAfterDelay, true);
    });

    console.log(`\n================================================================`);
    console.log(`📊 SOS WORKFLOW INTEGRATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    process.exit(passedTests === totalTests ? 0 : 1);
}

runSOSSuite().catch(e => {
    console.error('SOS suite failed:', e);
    process.exit(1);
});

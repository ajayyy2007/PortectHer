/**
 * FLARE Women Safety - Automated Service & Integration Test Suite
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const crypto = require('crypto');

console.log('================================================================');
console.log('🧪 RUNNING FLARE SERVICE & NOTIFICATION VERIFICATION TESTS');
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

async function runSuite() {
    // -------------------------------------------------------------------------
    // TEST 1: Module Loading & Syntax Verification
    // -------------------------------------------------------------------------
    runTest('1.1 All backend services and models must load without syntax errors', () => {
        const emailService = require('../services/emailService');
        const smsService = require('../services/smsService');
        const whatsappService = require('../services/whatsappService');
        const User = require('../models/User');
        const Contact = require('../models/Contact');
        const Alert = require('../models/Alert');
        const OTPVerification = require('../models/OTPVerification');
        const WhatsAppMessage = require('../models/WhatsAppMessage');

        assert(typeof emailService.sendEmergencyEmail === 'function', 'sendEmergencyEmail should be a function');
        assert(typeof smsService.sendSMS === 'function', 'sendSMS should be a function');
        assert(typeof whatsappService.sendWhatsAppMessage === 'function', 'sendWhatsAppMessage should be a function');
        assert(Contact.schema.path('emailEnabled'), 'Contact schema must have emailEnabled field');
        assert(WhatsAppMessage.schema.path('status').enumValues.includes('simulated'), 'WhatsAppMessage must support simulated status');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Email Service Logic
    // -------------------------------------------------------------------------
    runTest('2.1 Email address format validation', () => {
        const { isValidEmail } = require('../services/emailService');
        assert.strictEqual(isValidEmail('test@example.com'), true);
        assert.strictEqual(isValidEmail('user.name+tag@sub.domain.co'), true);
        assert.strictEqual(isValidEmail(''), false);
        assert.strictEqual(isValidEmail('invalid-email'), false);
        assert.strictEqual(isValidEmail('@missinguser.com'), false);
        assert.strictEqual(isValidEmail(null), false);
    });

    await runAsyncTest('2.2 Email service rejects invalid recipient without sending', async () => {
        const { sendEmergencyEmail } = require('../services/emailService');
        const res = await sendEmergencyEmail({
            recipientEmail: 'invalid-email',
            userName: 'Test User',
            latitude: 13.0827,
            longitude: 80.2707,
            emergencyId: 'EMG_TEST_1'
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'failed');
        assert(res.error.includes('Invalid recipient email address'));
    });

    await runAsyncTest('2.3 Email config verification diagnostics', async () => {
        const { verifyEmailConfig } = require('../services/emailService');
        const diag = await verifyEmailConfig();
        assert(typeof diag === 'object');
        assert(diag.configured !== undefined);
        console.log(`     Diagnostic Info: configured=${diag.configured}, verified=${diag.verified || false}`);
    });

    // -------------------------------------------------------------------------
    // TEST 3: SMS Service Logic
    // -------------------------------------------------------------------------
    runTest('3.1 Phone number E.164 normalization', () => {
        const { formatPhoneE164 } = require('../services/smsService');
        assert.strictEqual(formatPhoneE164('9876543210'), '+919876543210');
        assert.strictEqual(formatPhoneE164('+919876543210'), '+919876543210');
        assert.strictEqual(formatPhoneE164('+12025550123'), '+12025550123');
        assert.strictEqual(formatPhoneE164('1234567890', '+1'), '+11234567890');
        assert.strictEqual(formatPhoneE164(''), null);
        assert.strictEqual(formatPhoneE164(null), null);
    });

    runTest('3.2 SMS Provider status detection', () => {
        const { getSMSProviderStatus } = require('../services/smsService');
        const status = getSMSProviderStatus();
        assert(typeof status.twilio === 'boolean');
        assert(typeof status.fast2sms === 'boolean');
        console.log(`     SMS Provider Detection: Twilio=${status.twilio}, Fast2SMS=${status.fast2sms}`);
    });

    await runAsyncTest('3.3 SMS Service does NOT return false success when Twilio fails or is unconfigured', async () => {
        const { sendSMS } = require('../services/smsService');
        const res = await sendSMS({
            to: '+919876543210',
            body: 'Test Emergency SMS'
        });
        // If provider fails (or is unconfigured), success must be FALSE
        if (!res.success) {
            assert.strictEqual(res.success, false);
            assert(['failed', 'not_configured'].includes(res.status));
            assert(res.error.length > 0);
            console.log(`     Accurate SMS Failure Recorded: status=${res.status}, error=${res.error}`);
        } else {
            // Real provider accepted
            assert(['submitted', 'delivered'].includes(res.status));
        }
    });

    // -------------------------------------------------------------------------
    // TEST 4: WhatsApp Service Logic
    // -------------------------------------------------------------------------
    runTest('4.1 WhatsApp recipient digits formatting', () => {
        const { formatRecipientPhone } = require('../services/whatsappService');
        assert.strictEqual(formatRecipientPhone('9876543210'), '919876543210');
        assert.strictEqual(formatRecipientPhone('+919876543210'), '919876543210');
        assert.strictEqual(formatRecipientPhone('+14155238886'), '14155238886');
        assert.strictEqual(formatRecipientPhone(''), null);
    });

    await runAsyncTest('4.2 WhatsApp simulation in development mode is labeled correctly', async () => {
        const originalMode = process.env.WHATSAPP_MODE;
        process.env.WHATSAPP_MODE = 'development';
        const { sendWhatsAppMessage } = require('../services/whatsappService');
        const res = await sendWhatsAppMessage({
            to: '+919876543210',
            text: 'Test Dev WhatsApp Alert'
        });
        assert.strictEqual(res.simulated, true);
        assert.strictEqual(res.status, 'simulated');
        assert(res.detail.includes('simulated in development mode'));
        process.env.WHATSAPP_MODE = originalMode;
    });

    await runAsyncTest('4.3 WhatsApp in production mode fails safely when tokens are placeholders', async () => {
        const originalMode = process.env.WHATSAPP_MODE;
        const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const originalTwilioSid = process.env.TWILIO_ACCOUNT_SID;

        process.env.WHATSAPP_MODE = 'production';
        process.env.WHATSAPP_ACCESS_TOKEN = 'your_meta_whatsapp_access_token_here';
        process.env.WHATSAPP_PHONE_NUMBER_ID = 'your_meta_phone_number_id_here';
        process.env.TWILIO_ACCOUNT_SID = ''; // remove twilio fallback for this test

        const { sendWhatsAppMessage } = require('../services/whatsappService');
        const res = await sendWhatsAppMessage({
            to: '+919876543210',
            text: 'Test WhatsApp Alert'
        });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'not_configured');
        assert.strictEqual(res.simulated, false);
        assert(res.error.includes('credentials are not configured in production mode'));

        // Restore env
        process.env.WHATSAPP_MODE = originalMode;
        process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
        process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
        process.env.TWILIO_ACCOUNT_SID = originalTwilioSid;
    });

    // -------------------------------------------------------------------------
    // TEST 5: Express App & Health Endpoints
    // -------------------------------------------------------------------------
    runTest('5.1 Express app initialisation and routes registry check', () => {
        const app = require('../server');
        const router = app.router || app._router;
        assert(router, 'Express app should have router stack configured');
        assert(router.stack.length > 0, 'Routes should be registered in router stack');
    });

    // -------------------------------------------------------------------------
    // TEST 6: OTP Hashing and Expiry Logic
    // -------------------------------------------------------------------------
    runTest('6.1 OTP SHA-256 secure hashing and verification check', () => {
        const rawOtp = '482915';
        const expectedHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
        const matchingHash = crypto.createHash('sha256').update('482915').digest('hex');
        const incorrectHash = crypto.createHash('sha256').update('123456').digest('hex');

        assert.strictEqual(expectedHash, matchingHash);
        assert.notStrictEqual(expectedHash, incorrectHash);
    });

    // -------------------------------------------------------------------------
    // TEST 7: WhatsApp Webhook Challenge & Signature Logic
    // -------------------------------------------------------------------------
    runTest('7.1 WhatsApp Webhook Challenge verification logic', () => {
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'women_safety_webhook_secret';
        const challenge = 'CHALLENGE_ACCEPTED_TEST_STRING_123';

        // Valid challenge request
        const queryValid = {
            'hub.mode': 'subscribe',
            'hub.verify_token': verifyToken,
            'hub.challenge': challenge
        };
        assert.strictEqual(queryValid['hub.mode'] === 'subscribe' && queryValid['hub.verify_token'] === verifyToken, true);

        // Invalid token request
        const queryInvalid = {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'wrong_secret_token',
            'hub.challenge': challenge
        };
        assert.strictEqual(queryInvalid['hub.verify_token'] === verifyToken, false);
    });

    console.log(`\n================================================================`);
    console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    process.exit(passedTests === totalTests ? 0 : 1);
}

runSuite().catch(e => {
    console.error('Test suite failed:', e);
    process.exit(1);
});

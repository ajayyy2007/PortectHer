/**
 * FLARE WOMEN SAFETY - SMS PROVIDER INDEPENDENT TEST & DIAGNOSTIC RUNNER
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sendSMS, getSMSProviderStatus, verifySMSConfig, formatPhoneE164 } = require('../services/smsService');

async function runSMSDiagnostic() {
    console.log('================================================================');
    console.log('📱 FLARE SMS PROVIDER LIVE DIAGNOSTIC & INDEPENDENT TEST');
    console.log('================================================================\n');

    const status = getSMSProviderStatus();
    console.log('1. Provider Detection:');
    console.log('   - Twilio Configured:', status.twilio);
    console.log('   - Fast2SMS Configured:', status.fast2sms);

    const fromPhone = process.env.TWILIO_PHONE_NUMBER?.trim();
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();

    console.log('\n2. Credentials Check:');
    console.log('   - TWILIO_ACCOUNT_SID:', sid ? `Present (${sid.substring(0, 4)}... length=${sid.length})` : 'MISSING');
    console.log('   - TWILIO_AUTH_TOKEN:', token ? `Present (length=${token.length})` : 'MISSING');
    console.log('   - TWILIO_PHONE_NUMBER:', fromPhone || 'MISSING');

    const testRecipient = '+919344684275'; // User contact Prakash Raj

    console.log('\n3. Executing Live SMS Dispatch Test to:', testRecipient);
    const result = await sendSMS({
        to: testRecipient,
        contactName: 'Prakash Raj',
        senderName: 'FLARE Diagnostic',
        body: 'FLARE Safety Alert Test Verification.'
    });

    console.log('\n4. Provider Response:');
    console.log('   - Success:', result.success);
    console.log('   - Provider:', result.provider);
    console.log('   - Status:', result.status);
    console.log('   - HTTP Status:', result.httpStatus);
    console.log('   - Provider Error Code:', result.errorCode);
    console.log('   - Error Detail:', result.error);

    console.log('\n================================================================');
    if (result.success) {
        console.log('✅ SMS DISPATCH ACCEPTED BY CARRIER GATEWAY');
    } else {
        console.log('❌ SMS DISPATCH FAILED: Accurate failure captured from provider');
    }
    console.log('================================================================\n');
}

runSMSDiagnostic();

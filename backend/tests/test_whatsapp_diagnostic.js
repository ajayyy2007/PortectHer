/**
 * FLARE WOMEN SAFETY - WHATSAPP LIVE DIAGNOSTIC & INDEPENDENT TEST RUNNER
 * Verifies Meta WhatsApp Cloud API credentials, sender phone, template, and payload safely.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');
const { getWhatsAppProviderStatus, verifyWhatsAppConfig, formatRecipientPhone, sendWhatsAppMessage } = require('../services/whatsappService');

async function runWhatsAppDiagnostic() {
    console.log('================================================================');
    console.log('📲 FLARE WHATSAPP CLOUD API - LIVE DIAGNOSTIC & READINESS TEST');
    console.log('================================================================\n');

    const mode = (process.env.WHATSAPP_MODE || 'development').toLowerCase().trim();
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
    const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v18.0';
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

    console.log('1. ENVIRONMENT CONFIGURATION:');
    console.log(`   - WHATSAPP_MODE: ${mode}`);
    console.log(`   - WHATSAPP_API_VERSION: ${apiVersion}`);
    console.log(`   - WHATSAPP_ACCESS_TOKEN: ${token ? (token.includes('your_') ? '❌ PLACEHOLDER ("' + token.substring(0, 10) + '...")' : `✅ Configured (Length: ${token.length})`) : '❌ MISSING'}`);
    console.log(`   - WHATSAPP_PHONE_NUMBER_ID: ${phoneId ? (phoneId.includes('your_') ? '❌ PLACEHOLDER' : `✅ Configured (${phoneId})`) : '❌ MISSING'}`);
    console.log(`   - WHATSAPP_BUSINESS_ACCOUNT_ID: ${wabaId ? (wabaId.includes('your_') ? '❌ PLACEHOLDER' : `✅ Configured (${wabaId})`) : '❌ MISSING'}`);
    console.log(`   - WHATSAPP_TEMPLATE_NAME: ${templateName ? `✅ "${templateName}"` : '⚠️ NOT CONFIGURED (Free-form text only; restricted to 24-hr session window)'}`);
    console.log(`   - WHATSAPP_VERIFY_TOKEN: ${verifyToken ? '✅ Configured' : '❌ MISSING'}`);

    const isPlaceholder = !token || token.includes('your_') || !phoneId || phoneId.includes('your_');

    console.log('\n2. PROVIDER STATUS EVALUATION:');
    const providerStatus = getWhatsAppProviderStatus();
    console.log(`   - Mode: ${providerStatus.mode}`);
    console.log(`   - Meta Cloud API Ready: ${providerStatus.isMetaConfigured}`);
    console.log(`   - Twilio WhatsApp Fallback Ready: ${providerStatus.isTwilioWaConfigured}`);

    if (isPlaceholder) {
        console.log('\n================================================================');
        console.log('⚠️ DIAGNOSTIC RESULT: META CREDENTIALS MISSING / PLACEHOLDERS');
        console.log('================================================================');
        console.log('Cannot dispatch live HTTP request to Meta Graph API because real credentials');
        console.log('are not configured in backend/.env.');
        console.log('\nRequired Meta Configuration:');
        console.log('1. WHATSAPP_ACCESS_TOKEN: Generate a System User Access Token in Meta Business Manager');
        console.log('   with "whatsapp_business_messaging" and "whatsapp_business_management" permissions.');
        console.log('2. WHATSAPP_PHONE_NUMBER_ID: Copy Phone Number ID from Meta Developer Portal -> WhatsApp -> API Setup.');
        console.log('3. WHATSAPP_BUSINESS_ACCOUNT_ID: Copy WhatsApp Business Account ID from Meta Developer Portal -> WhatsApp -> API Setup.');
        console.log('4. WHATSAPP_TEMPLATE_NAME: Create and get approved an emergency template (e.g. "women_safety_sos_alert")');
        console.log('   in Meta WhatsApp Manager to send alerts outside the 24-hr customer service window.\n');
        return;
    }

    // If real credentials exist, verify with Meta Graph API
    console.log('\n3. VERIFYING SENDER WITH META GRAPH API...');
    try {
        const metaRes = await axios.get(`https://graph.facebook.com/${apiVersion}/${phoneId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { fields: 'verified_name,display_phone_number,quality_rating,code_verification_status' },
            timeout: 8000
        });

        console.log('✅ Meta Cloud API Sender Verified:');
        console.log(`   - Display Phone: ${metaRes.data.display_phone_number || 'N/A'}`);
        console.log(`   - Verified Name: ${metaRes.data.verified_name || 'N/A'}`);
        console.log(`   - Quality Rating: ${metaRes.data.quality_rating || 'UNKNOWN'}`);

        // Perform one test dispatch to single recipient if specified
        const testRecipient = process.env.TEST_WHATSAPP_RECIPIENT || '919344684275';
        console.log(`\n4. SENDING SINGLE TEST SOS MESSAGE TO: +${testRecipient}`);
        const sendRes = await sendWhatsAppMessage({
            to: testRecipient,
            text: '🚨 [FLARE Women Safety] Diagnostic test alert message.',
            templateName: templateName || null
        });

        console.log('Dispatch Result:', sendRes);
    } catch (err) {
        console.error('❌ Meta Graph API Verification Failed:');
        console.error(`   - HTTP Status: ${err.response?.status || 'N/A'}`);
        console.error(`   - Error Code: ${err.response?.data?.error?.code || 'N/A'}`);
        console.error(`   - Error Message: ${err.response?.data?.error?.message || err.message}`);
        console.error(`   - FB Trace ID: ${err.response?.data?.error?.fbtrace_id || 'N/A'}`);
    }
}

runWhatsAppDiagnostic();

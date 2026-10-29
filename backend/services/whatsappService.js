const axios = require('axios');

/**
 * Official Meta WhatsApp Cloud API Service
 * Handles development mode vs production mode safely.
 */

// Helper to format international phone number for Meta WhatsApp Cloud API (digits only, e.g. 919876543210)
const formatRecipientPhone = (phone, defaultCountryCode = '+91') => {
    if (!phone) return null;
    let cleaned = phone.toString().trim();
    if (cleaned.startsWith('+')) {
        return cleaned.replace(/\D/g, ''); // E.164 digits without '+'
    }
    let digits = cleaned.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
        const prefix = defaultCountryCode.replace(/\D/g, '') || '91';
        digits = prefix + digits;
    }
    return digits;
};

/**
 * Helper to check WhatsApp configuration state
 */
const getWhatsAppProviderStatus = () => {
    const mode = (process.env.WHATSAPP_MODE || 'development').toLowerCase().trim();
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const isMetaConfigured = Boolean(
        token && phoneId &&
        !token.includes('your_meta') &&
        !token.includes('your_whatsapp') &&
        !phoneId.includes('your_meta') &&
        !phoneId.includes('your_whatsapp')
    );

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWaNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const isTwilioWaConfigured = Boolean(
        twilioSid && twilioToken && twilioWaNumber &&
        !twilioSid.includes('your_twilio') &&
        !twilioToken.includes('your_twilio')
    );

    return {
        mode,
        isMetaConfigured,
        isTwilioWaConfigured,
        isConfigured: mode === 'development' || isMetaConfigured || isTwilioWaConfigured
    };
};

/**
 * Diagnostic verification helper
 */
const verifyWhatsAppConfig = async () => {
    const status = getWhatsAppProviderStatus();
    if (status.mode === 'development') {
        return {
            mode: 'development',
            configured: true,
            message: 'WhatsApp service running in DEVELOPMENT mode. Alerts are simulated.'
        };
    }

    if (status.isMetaConfigured) {
        return {
            mode: 'production',
            provider: 'Meta WhatsApp Cloud API',
            configured: true,
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
            apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
            templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'None (text message mode)',
            message: 'Meta WhatsApp Cloud API configured for production.'
        };
    }

    if (status.isTwilioWaConfigured) {
        return {
            mode: 'production',
            provider: 'Twilio WhatsApp API',
            configured: true,
            senderNumber: process.env.TWILIO_WHATSAPP_NUMBER,
            message: 'Twilio WhatsApp fallback configured for production.'
        };
    }

    return {
        mode: 'production',
        configured: false,
        error: 'WhatsApp credentials missing or placeholder in production mode. Set WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID or switch WHATSAPP_MODE=development.'
    };
};

/**
 * Send WhatsApp Message via Meta WhatsApp Cloud API or Twilio fallback
 *
 * @param {Object} options
 * @param {string} options.to - Recipient phone number
 * @param {string} options.text - Plain text content
 * @param {string} [options.templateName] - Meta template name
 * @param {Array}  [options.templateComponents] - Meta template components
 * @param {string} [options.languageCode='en_US'] - Template language
 * @returns {Promise<Object>} Accurate status result
 */
const sendWhatsAppMessage = async ({
    to,
    text,
    templateName,
    templateComponents,
    languageCode = 'en_US'
}) => {
    const mode = (process.env.WHATSAPP_MODE || 'development').toLowerCase().trim();
    const recipient = formatRecipientPhone(to);

    if (!recipient) {
        return {
            success: false,
            status: 'failed',
            error: `Invalid recipient phone number: "${to}"`,
            recipient: to
        };
    }

    // 1. DEVELOPMENT MODE - Explicit simulation, never labeled as real delivery
    if (mode === 'development') {
        const simulatedMessageId = `wamid.dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        console.log(`\n===============================================================`);
        console.log(`📲 [WHATSAPP CLOUD API - DEV MODE SIMULATION]`);
        console.log(`• Mode: development`);
        console.log(`• To: +${recipient}`);
        if (templateName) {
            console.log(`• Template: ${templateName} (${languageCode})`);
        }
        console.log(`• Message Content:\n${text}`);
        console.log(`• Simulated Message ID: ${simulatedMessageId}`);
        console.log(`===============================================================\n`);

        return {
            success: true, // successful simulation
            simulated: true,
            status: 'simulated',
            mode: 'development',
            messageId: simulatedMessageId,
            recipient: '+' + recipient,
            detail: 'WhatsApp alert simulated in development mode. No real message was sent.'
        };
    }

    // 2. PRODUCTION MODE
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';

    const isMetaConfigured = Boolean(
        token && phoneId &&
        !token.includes('your_meta') &&
        !token.includes('your_whatsapp') &&
        !phoneId.includes('your_meta') &&
        !phoneId.includes('your_whatsapp')
    );

    // 2A. Real Meta WhatsApp Cloud API
    if (isMetaConfigured) {
        try {
            const url = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`;

            let payload;
            if (templateName) {
                payload = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: recipient,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: languageCode },
                        components: templateComponents || []
                    }
                };
            } else {
                payload = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: recipient,
                    type: 'text',
                    text: { preview_url: true, body: text }
                };
            }

            console.log(`[WhatsApp Cloud API] Dispatching real request to +${recipient} (${templateName ? 'template: ' + templateName : 'text'})...`);

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const data = response.data;
            const messageId = data?.messages?.[0]?.id || `wamid.${Date.now()}`;
            console.log(`✅ [WhatsApp Cloud API] Message accepted for +${recipient} (ID: ${messageId})`);

            return {
                success: true,
                simulated: false,
                status: 'sent', // API accepted; webhook needed to confirm 'delivered'
                mode: 'production',
                provider: 'meta_cloud_api',
                messageId: messageId,
                recipient: '+' + recipient,
                detail: 'Message accepted by Meta WhatsApp Cloud API; delivery confirmation pending via webhook.',
                rawResponse: data
            };
        } catch (error) {
            let errorDetail = error.response?.data?.error?.message || error.message;
            const fbTraceId = error.response?.data?.error?.fbtrace_id;
            const errorCode = error.response?.data?.error?.code;
            const errorSubcode = error.response?.data?.error?.error_subcode;
            const httpStatus = error.response?.status || 400;

            if (errorCode === 190) {
                errorDetail = 'Meta Access Token is invalid, expired, or revoked. Please generate a new System User access token in Meta Business Manager.';
            } else if (errorCode === 100) {
                errorDetail = `Parameter validation error: ${error.response?.data?.error?.error_user_msg || errorDetail}. Verify that all template parameters are valid non-empty strings.`;
            } else if (errorCode === 131030) {
                errorDetail = 'Recipient phone number is not in the allowed test numbers list for Meta Developer Sandbox. Add recipient under WhatsApp -> API Setup -> To.';
            } else if (errorCode === 131047) {
                errorDetail = 'More than 24 hours have passed since the contact last messaged your WhatsApp number. An approved message template (WHATSAPP_TEMPLATE_NAME) is required.';
            } else if (errorCode === 131026) {
                errorDetail = 'Message undeliverable: The recipient number does not exist on WhatsApp, or the account messaging limit was reached.';
            } else if (errorCode === 132000 || errorCode === 131009) {
                errorDetail = 'Template parameter mismatch: Number of parameters provided does not match the approved template definition in WhatsApp Manager.';
            } else if (errorCode === 132001) {
                errorDetail = `Template "${templateName}" does not exist in language "${languageCode}" or has not been approved by Meta yet.`;
            } else if (errorCode === 130429 || errorCode === 80007 || httpStatus === 429) {
                errorDetail = 'Meta Cloud API rate limit exceeded. Please retry after a brief interval.';
            }

            console.error(`❌ [WhatsApp Cloud API Error] Failed to send to +${recipient}: [Code ${errorCode || 'N/A'}, HTTP ${httpStatus}] ${errorDetail}`);

            return {
                success: false,
                simulated: false,
                status: 'failed',
                mode: 'production',
                provider: 'meta_cloud_api',
                error: `WhatsApp Cloud API error: ${errorDetail}`,
                errorCode,
                errorSubcode,
                httpStatus,
                fbTraceId,
                recipient: '+' + recipient
            };
        }
    }

    // 2B. Twilio WhatsApp Fallback in production (only if configured)
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_WHATSAPP_NUMBER;
    const isTwilioWaConfigured = Boolean(
        twilioSid && twilioToken && twilioPhone &&
        !twilioSid.includes('your_twilio') &&
        !twilioToken.includes('your_twilio')
    );

    if (isTwilioWaConfigured) {
        try {
            const twilio = require('twilio');
            const twilioClient = twilio(twilioSid, twilioToken);
            const fromNumber = twilioPhone.startsWith('whatsapp:') ? twilioPhone : 'whatsapp:' + twilioPhone;
            const toNumber = 'whatsapp:+' + recipient;

            console.log(`[Twilio WhatsApp API] Dispatching WhatsApp alert to +${recipient} from ${fromNumber}...`);
            const twilioRes = await twilioClient.messages.create({
                body: text,
                from: fromNumber,
                to: toNumber
            });

            console.log(`✅ [Twilio WhatsApp API] Accepted for +${recipient} (SID: ${twilioRes.sid})`);

            return {
                success: true,
                simulated: false,
                status: twilioRes.status === 'delivered' ? 'delivered' : 'sent',
                mode: 'production',
                provider: 'twilio_whatsapp',
                messageId: twilioRes.sid,
                recipient: '+' + recipient,
                detail: `Message accepted by Twilio WhatsApp (Status: ${twilioRes.status || 'queued'}).`
            };
        } catch (twErr) {
            console.error(`❌ [Twilio WhatsApp API Error] Failed for +${recipient}:`, twErr.message);
            return {
                success: false,
                simulated: false,
                status: 'failed',
                mode: 'production',
                provider: 'twilio_whatsapp',
                error: `Twilio WhatsApp error: ${twErr.message}`,
                recipient: '+' + recipient
            };
        }
    }

    // 2C. Production mode with NO configured credentials - NEVER SILENTLY SIMULATE
    console.error(`❌ [WhatsApp Service] Neither Meta Cloud API nor Twilio WhatsApp is configured in production mode.`);
    return {
        success: false,
        simulated: false,
        status: 'not_configured',
        mode: 'production',
        error: 'WhatsApp alert not sent: WhatsApp provider credentials are not configured in production mode.',
        recipient: '+' + recipient
    };
};

/**
 * Send SOS Emergency WhatsApp Alert
 */
const sendSOSWhatsAppAlert = async (recipientPhone, sosData) => {
    const { userName, userPhone, userEmail, latitude, longitude, mapUrl, emergencyId, trackingUrl, videoUrl, evidenceUrl } = sosData;

    const hasValidCoords = latitude !== null && latitude !== undefined && !isNaN(Number(latitude)) &&
                           longitude !== null && longitude !== undefined && !isNaN(Number(longitude));
    const formattedLat = hasValidCoords ? Number(latitude).toFixed(5) : 'Unavailable';
    const formattedLng = hasValidCoords ? Number(longitude).toFixed(5) : 'Unavailable';
    const locationDisplay = mapUrl || (hasValidCoords ? `https://www.openstreetmap.org/?mlat=${formattedLat}&mlon=${formattedLng}#map=17/${formattedLat}/${formattedLng}` : 'Current GPS location unavailable');
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let textBody = `🚨 FLARE WOMEN SAFETY — EMERGENCY ALERT 🚨\n\n` +
                   `[${userName.toUpperCase()}] has activated an SOS emergency and may need immediate assistance.\n\n` +
                   `📍 Location:\n${locationDisplay}\n\n` +
                   `Latitude: ${formattedLat}\n` +
                   `Longitude: ${formattedLng}\n\n` +
                   `⏰ Time: ${timestamp}\n\n` +
                   `🚨 Emergency ID: ${emergencyId}\n`;

    if (trackingUrl) {
        textBody += `\n📡 Live Tracking:\n${trackingUrl}\n`;
    }

    if (evidenceUrl) {
        textBody += `\n📷 Evidence:\n${evidenceUrl}\n`;
    }

    if (videoUrl) {
        textBody += `\n🎥 Live Video:\n${videoUrl}\n`;
    }

    textBody += `\nPlease contact ${userName} (${userPhone}) or emergency services immediately.`;

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
    let templateComponents = null;

    if (templateName) {
        templateComponents = [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: String(userName || 'FLARE User') },
                    { type: 'text', text: String(mapUrl || locationDisplay || 'Location unavailable') },
                    { type: 'text', text: String(trackingUrl || mapUrl || 'Live tracking unavailable') }
                ]
            }
        ];
    }

    return await sendWhatsAppMessage({
        to: recipientPhone,
        text: textBody,
        templateName: templateName || null,
        templateComponents: templateComponents
    });
};

/**
 * Send OTP Verification via WhatsApp
 */
const sendOTPWhatsApp = async (recipientPhone, otp) => {
    const textBody = `📲 Your Women Safety Verification OTP is: *${otp}*\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.`;

    return await sendWhatsAppMessage({
        to: recipientPhone,
        text: textBody
    });
};

module.exports = {
    sendWhatsAppMessage,
    sendSOSWhatsAppAlert,
    sendOTPWhatsApp,
    formatRecipientPhone,
    getWhatsAppProviderStatus,
    verifyWhatsAppConfig
};

const axios = require('axios');
let twilioClientInstance = null;

/**
 * Sanitize error messages to prevent leaking Account SIDs, tokens or credentials
 */
const sanitizeErrorMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return '';
    return msg
        .replace(/AC[a-f0-9]{32}/gi, '[ACCOUNT_SID]')
        .replace(/[a-f0-9]{32}/gi, '[AUTH_TOKEN]');
};

/**
 * Format phone number to E.164 standard (+919876543210)
 */
const formatPhoneE164 = (phone, defaultCountryCode = '+91') => {
    if (!phone) return null;
    let cleaned = phone.toString().trim();
    if (cleaned.startsWith('+')) {
        let digits = cleaned.substring(1).replace(/\D/g, '');
        return digits ? '+' + digits : null;
    }
    let digits = cleaned.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
        const cc = defaultCountryCode.replace(/\D/g, '') || '91';
        digits = cc + digits;
    }
    return '+' + digits;
};

/**
 * Check which SMS provider is configured
 */
const getSMSProviderStatus = () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;
    const fast2smsKey = process.env.FAST2SMS_API_KEY;

    const isTwilioConfigured = Boolean(
        sid && token && fromPhone &&
        !sid.includes('your_twilio') &&
        !token.includes('your_twilio') &&
        !fromPhone.includes('your_twilio')
    );

    const isFast2SMSConfigured = Boolean(
        fast2smsKey &&
        !fast2smsKey.includes('your_fast2sms') &&
        fast2smsKey.trim().length > 5
    );

    return {
        twilio: isTwilioConfigured,
        fast2sms: isFast2SMSConfigured,
        anyConfigured: isTwilioConfigured || isFast2SMSConfigured
    };
};

/**
 * Verify SMS provider configuration during startup or diagnostics
 */
const verifySMSConfig = async () => {
    const status = getSMSProviderStatus();
    if (!status.anyConfigured) {
        return {
            configured: false,
            message: 'SMS provider is not configured. Configure TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE_NUMBER or FAST2SMS_API_KEY in .env.'
        };
    }

    const providers = [];
    if (status.twilio) providers.push('Twilio SMS');
    if (status.fast2sms) providers.push('Fast2SMS');

    return {
        configured: true,
        providers,
        message: `SMS provider(s) configured: ${providers.join(', ')}.`
    };
};

/**
 * Send real SMS using configured SMS provider (Fast2SMS for Indian numbers or Twilio)
 *
 * @param {Object} options
 * @param {string} options.to - Recipient phone number
 * @param {string} options.body - SMS text content
 * @param {string} [options.countryCode='+91'] - Default country code
 * @param {string} [options.contactName='Emergency Contact'] - Name of the contact
 * @param {string} [options.senderName='User'] - Name of the user sending the alert
 * @returns {Promise<Object>} Accurate delivery result
 */
const sendSMS = async ({
    to,
    body,
    countryCode = '+91',
    contactName = 'Emergency Contact',
    senderName = 'User'
}) => {
    const recipientFormatted = formatPhoneE164(to, countryCode);

    if (!recipientFormatted) {
        return {
            success: false,
            provider: 'none',
            status: 'failed',
            error: `Invalid phone number: "${to}"`,
            to,
            contactName
        };
    }

    const providerStatus = getSMSProviderStatus();

    // 1. Try Fast2SMS for Indian (+91) numbers if configured
    if (providerStatus.fast2sms && recipientFormatted.startsWith('+91')) {
        const raw10Digits = recipientFormatted.replace('+91', '');
        const fast2smsKey = process.env.FAST2SMS_API_KEY.trim();

        try {
            console.log(`[SMS Service] Dispatching SMS to ${contactName} (${recipientFormatted}) via Fast2SMS...`);
            
            // Fast2SMS bulkV2 Quick SMS route
            const fastRes = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
                route: 'q',
                message: body,
                language: 'english',
                flash: 0,
                numbers: raw10Digits
            }, {
                headers: {
                    'authorization': fast2smsKey,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (fastRes.data && fastRes.data.return === true) {
                const reqId = (fastRes.data.request_id || (Array.isArray(fastRes.data.data) && fastRes.data.data[0])) || `f2s_${Date.now()}`;
                console.log(`✅ [Fast2SMS] SMS accepted by provider for ${contactName} (${recipientFormatted}) | ReqID: ${reqId}`);
                return {
                    success: true,
                    provider: 'fast2sms',
                    status: 'submitted',
                    messageId: String(reqId),
                    to: recipientFormatted,
                    contactName,
                    detail: 'Message accepted by Fast2SMS gateway; carrier delivery in progress.'
                };
            } else {
                const errMsg = (fastRes.data && fastRes.data.message) ? fastRes.data.message[0] || fastRes.data.message : 'Fast2SMS rejected request';
                console.error(`❌ [Fast2SMS Error] Failed for ${recipientFormatted}:`, errMsg);
                // If Fast2SMS failed and Twilio is configured, fall through to Twilio
                if (!providerStatus.twilio) {
                    return {
                        success: false,
                        provider: 'fast2sms',
                        status: 'failed',
                        error: `Fast2SMS error: ${errMsg}`,
                        httpStatus: fastRes.status || 400,
                        errorCode: fastRes.data?.status_code || null,
                        to: recipientFormatted,
                        contactName
                    };
                }
            }
        } catch (fastErr) {
            const errDetail = fastErr.response?.data?.message || fastErr.message;
            console.warn(`⚠️ [Fast2SMS Exception] ${errDetail}. Attempting Twilio if configured...`);
            if (!providerStatus.twilio) {
                return {
                    success: false,
                    provider: 'fast2sms',
                    status: 'failed',
                    error: `Fast2SMS error: ${errDetail}`,
                    httpStatus: fastErr.response?.status || 400,
                    errorCode: fastErr.response?.data?.status_code || null,
                    to: recipientFormatted,
                    contactName
                };
            }
        }
    }

    // 2. Try Twilio SMS if configured
    if (providerStatus.twilio) {
        const sid = process.env.TWILIO_ACCOUNT_SID.trim();
        const token = process.env.TWILIO_AUTH_TOKEN.trim();
        const fromPhone = process.env.TWILIO_PHONE_NUMBER.trim();

        try {
            if (!twilioClientInstance) {
                const twilio = require('twilio');
                twilioClientInstance = twilio(sid, token);
            }

            console.log(`[SMS Service] Dispatching real Twilio SMS from ${fromPhone} to ${contactName} (${recipientFormatted})...`);

            const message = await Promise.race([
                twilioClientInstance.messages.create({
                    body,
                    from: fromPhone,
                    to: recipientFormatted
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Twilio request timed out after 15 seconds')), 15000)
                )
            ]);

            console.log(`✅ [Twilio SMS] Accepted for ${contactName} (${recipientFormatted}) | SID: ${message.sid} | Status: ${message.status}`);

            return {
                success: true,
                provider: 'twilio',
                status: message.status === 'delivered' ? 'delivered' : 'submitted',
                sid: message.sid,
                to: recipientFormatted,
                contactName,
                detail: `Message accepted by Twilio (Status: ${message.status || 'queued'}). Delivery to carrier pending.`
            };
        } catch (twErr) {
            const rawMessage = sanitizeErrorMessage(twErr.message || 'Unknown Twilio error');
            const twCode = twErr.code || null;
            const httpStatus = twErr.status || (twCode === 20003 ? 401 : 400);

            let diagnosticReason = rawMessage;

            if (twCode === 20003 || httpStatus === 401) {
                diagnosticReason = 'Twilio Account Suspended or Inactive (Status 4). Real carrier SMS requires active Twilio balance and account reactivation in Twilio Console.';
            } else if (twCode === 21608) {
                diagnosticReason = 'Twilio Trial Account Restriction: Recipient number is not verified. On Twilio free trial accounts, add recipient to Verified Caller IDs (https://console.twilio.com/us1/develop/phone-numbers/manage/verified), or upgrade Twilio account.';
            } else if (twCode === 21408) {
                diagnosticReason = 'Twilio Geo-Permissions: SMS to India (+91) is not enabled in Twilio Console. Enable it under Messaging -> Settings -> Geo-Permissions.';
            } else if (twCode === 21211) {
                diagnosticReason = 'Invalid recipient phone number format.';
            } else if (twCode === 21614) {
                diagnosticReason = 'Twilio phone number is not SMS capable.';
            } else if (twCode === 20005) {
                diagnosticReason = 'Insufficient balance in Twilio account to send SMS.';
            } else if (twCode === 20429 || httpStatus === 429) {
                diagnosticReason = 'Twilio API rate limit exceeded.';
            } else if (twErr.name === 'TypeError' || twErr.code === 'ENOTFOUND' || twErr.code === 'ETIMEDOUT') {
                diagnosticReason = `Network failure communicating with Twilio API (${twErr.code || twErr.message}).`;
            }

            console.error(`❌ [Twilio SMS Error] Failed to send to ${contactName} (${recipientFormatted}): [Code ${twCode || 'N/A'}, HTTP ${httpStatus}] ${diagnosticReason}`);

            return {
                success: false,
                provider: 'twilio',
                status: 'failed',
                error: `Twilio delivery failed: ${diagnosticReason}`,
                errorCode: twCode,
                httpStatus,
                to: recipientFormatted,
                contactName
            };
        }
    }

    // 3. Neither provider is configured - DO NOT SIMULATE SUCCESS
    console.warn(`⚠️ [SMS Service] No SMS provider configured. SMS to ${contactName} (${recipientFormatted}) was not dispatched.`);

    return {
        success: false,
        provider: 'none',
        status: 'not_configured',
        error: 'SMS not sent: SMS provider is not configured.',
        to: recipientFormatted,
        contactName
    };
};

/**
 * Send SOS Emergency SMS to a single contact
 */
const sendSOS_SMS = async (contact, user, sosData) => {
    const { mapUrl, trackingUrl, emergencyId, timestamp } = sosData;
    const timeStr = timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const locationDisplay = mapUrl || 'Location unavailable';

    let smsBody = `FLARE WOMEN SAFETY — EMERGENCY ALERT\n\n` +
                  `${user.name} has activated SOS and may need immediate assistance.\n\n` +
                  `Location:\n${locationDisplay}\n\n` +
                  `Emergency ID:\n${emergencyId}\n\n` +
                  `Time:\n${timeStr}`;

    if (trackingUrl) {
        smsBody += `\n\nLive Tracking:\n${trackingUrl}`;
    }

    return await sendSMS({
        to: contact.phone,
        countryCode: contact.countryCode || user.countryCode || '+91',
        contactName: contact.name,
        senderName: user.name,
        body: smsBody
    });
};

/**
 * Send Individual Contact Direct Alert / Test SMS
 */
const sendDirectContactSMS = async (contact, user, customText = null, locationUrl = null) => {
    const userPhoneFormatted = formatPhoneE164(user.phone, user.countryCode) || user.phone;

    let smsBody;
    if (customText) {
        smsBody = `[Women Safety Alert from ${user.name}]: ${customText}`;
        if (locationUrl) {
            smsBody += `\nLocation: ${locationUrl}`;
        }
    } else {
        smsBody = `[Women Safety Alert]: Hello ${contact.name}, ${user.name} (${userPhoneFormatted}) has tested the Emergency SMS Alert system with your contact number. You are set as an active emergency responder.`;
        if (locationUrl) {
            smsBody += `\nCurrent Location: ${locationUrl}`;
        }
    }

    return await sendSMS({
        to: contact.phone,
        countryCode: contact.countryCode || user.countryCode || '+91',
        contactName: contact.name,
        senderName: user.name,
        body: smsBody
    });
};

module.exports = {
    formatPhoneE164,
    getSMSProviderStatus,
    verifySMSConfig,
    sendSMS,
    sendSOS_SMS,
    sendDirectContactSMS
};

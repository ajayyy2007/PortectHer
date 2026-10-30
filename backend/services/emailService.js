const nodemailer = require('nodemailer');
const sendWithResend = async ({
    to,
    subject,
    text,
    html,
    attachments = []
}) => {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error('RESEND_API_KEY is missing from environment variables.');
    }

    const payload = {
        from: process.env.RESEND_FROM || 'FLARE Women Safety <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
        html
    };


    if (attachments.length > 0) {
        payload.attachments = attachments.map((attachment) => {
            let content;

            if (attachment.content) {
                content = Buffer.isBuffer(attachment.content)
                    ? attachment.content.toString('base64')
                    : Buffer.from(String(attachment.content)).toString('base64');
            } else if (attachment.path) {
                content = require('fs')
                    .readFileSync(attachment.path)
                    .toString('base64');
            } else {
                throw new Error(
                    `Attachment "${attachment.filename || 'unknown'}" has no content or file path.`
                );
            }

            return {
                filename: attachment.filename || 'attachment',
                content,
                ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
                ...(attachment.cid ? { content_id: attachment.cid } : {})
            };
        });
    }


    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.message || result.name || `Resend API error: ${response.status}`
        );
    }

    return {
        messageId: result.id,
        recipient: to
    };
};

/**
 * Validates email address format
 */
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

/**
 * Shared pooled nodemailer transporter
 */
let cachedTransporter = null;
const getTransporter = () =>
 {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass || user === 'your_email@gmail.com' || pass === 'your_app_password') {
        return null;
    }

    if (cachedTransporter) {
        return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use STARTTLS
    requireTLS: true,
    auth: {
        user: user.trim(),
        pass: pass.trim().replace(/\s+/g, '')
        },
        pool: true,
        maxConnections: 3,
        connectionTimeout: 5000, // 5s connection threshold
        socketTimeout: 10000,    // 10s socket threshold
        tls: {
            rejectUnauthorized: true
        }
    });

    return cachedTransporter;
};

/**
 * Diagnostic helper to verify SMTP transporter connection
 * Does NOT leak credentials.
 */

const verifyEmailConfig = async () => {
    if (!process.env.RESEND_API_KEY) {
        return {
            configured: false,
            verified: false,
            message: 'Email service is not configured: RESEND_API_KEY is missing.'
        };
    }

    return {
        configured: true,
        verified: true,
        message: 'Resend API key is configured. Actual delivery must be tested.'
    };
};


/**
 * Send Emergency SOS Email to an Emergency Contact
 *
 * @param {Object} options
 * @param {string} options.recipientEmail
 * @param {string} options.userName
 * @param {string} [options.userPhone]
 * @param {string} [options.userEmail]
 * @param {string} options.emergencyId
 * @param {number|string} [options.latitude]
 * @param {number|string} [options.longitude]
 * @param {string} [options.googleMapsUrl]
 * @param {string} [options.mapUrl]
 * @param {string} [options.timestamp]
 * @param {string} [options.trackingUrl]
 * @param {string} [options.videoUrl]
 * @param {string} [options.photoEvidenceUrl]
 * @param {string} [options.audioEvidenceUrl]
 * @param {Array}  [options.attachments]
 * @returns {Promise<Object>} Delivery report
 */
const sendEmergencyEmail = async ({
    recipientEmail,
    userName = 'User',
    userPhone = 'Not provided',
    userEmail = 'Not provided',
    emergencyId,
    latitude,
    longitude,
    googleMapsUrl,
    mapUrl,
    timestamp,
    trackingUrl,
    videoUrl,
    photoEvidenceUrl,
    audioEvidenceUrl,
    attachments = []
}) => {
    if (!isValidEmail(recipientEmail)) {
        return {
            success: false,
            status: 'failed',
            recipient: recipientEmail,
            error: `Invalid recipient email address: "${recipientEmail}"`
        };
    }

    if (!process.env.RESEND_API_KEY) {
    return {
        success: false,
        status: 'not_configured',
        recipient: recipientEmail,
        error: 'Email not sent: RESEND_API_KEY is missing.'
    };
}

    const timeString = timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const hasValidCoords = latitude !== null && latitude !== undefined && !isNaN(Number(latitude)) &&
                           longitude !== null && longitude !== undefined && !isNaN(Number(longitude));
    const formattedLat = hasValidCoords ? Number(latitude).toFixed(5) : 'Unavailable';
    const formattedLng = hasValidCoords ? Number(longitude).toFixed(5) : 'Unavailable';

    // Google Maps Link (Feature 1: https://www.google.com/maps?q=LATITUDE,LONGITUDE)
    const finalGoogleMapsUrl = googleMapsUrl || (hasValidCoords ? `https://www.google.com/maps?q=${formattedLat},${formattedLng}` : null);
    const liveTracking = trackingUrl || null;

    // Detect Photo and Audio attachments
    const hasPhotoAttachment = Array.isArray(attachments) && attachments.some(a => a.cid === 'sos_evidence_photo');
    const hasAudioAttachment = Array.isArray(attachments) && attachments.some(a => a.cid === 'sos_ambient_audio');
    const hasPhoto = Boolean(hasPhotoAttachment || photoEvidenceUrl);
    const hasAudio = Boolean(hasAudioAttachment || audioEvidenceUrl);

    // Required exact subject line
    const emailSubject = 'EMERGENCY SOS ALERT — FLARE WOMEN SAFETY';

    // Plain text content
    let textBody =
`EMERGENCY SOS ALERT — FLARE WOMEN SAFETY

An emergency SOS alert has been activated.

User: ${userName}
User Phone: ${userPhone}
User Email: ${userEmail}
Emergency ID: ${emergencyId || 'EMG_ALERT'}

Location: ${finalGoogleMapsUrl || 'Location could not be obtained'}
Latitude: ${formattedLat}
Longitude: ${formattedLng}
Time: ${timeString}
`;

    if (liveTracking) {
        textBody += `\nLive Tracking: ${liveTracking}\n`;
    }

    if (hasPhoto && photoEvidenceUrl) {
        textBody += `\n📸 Camera Evidence Photo: ${photoEvidenceUrl}\n`;
    } else {
        textBody += `\n📸 Camera Evidence Photo: No camera evidence photo available (Permission denied or camera unavailable).\n`;
    }

    if (hasAudio && audioEvidenceUrl) {
        textBody += `\n🎙️ Emergency Ambient Voice Recording: 5-second emergency audio recording. ${audioEvidenceUrl}\n`;
    } else {
        textBody += `\n🎙️ Emergency Ambient Voice Recording: No emergency voice note available (Permission denied or microphone unavailable).\n`;
    }

    textBody += `\nPlease contact the user and provide assistance immediately.`;

    // Responsive HTML content restoring Google Maps, Live Tracking, Camera Evidence & 5-Second Audio
    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EMERGENCY SOS ALERT — FLARE WOMEN SAFETY</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 2px solid #ef4444; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.15);">
        <!-- Red Emergency Header -->
        <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 25px 20px; text-align: center; color: #ffffff;">
                <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">🚨 EMERGENCY SOS ALERT</h1>
                <p style="margin: 0; font-size: 14px; opacity: 0.95; font-weight: 500;">FLARE – Women Safety Emergency Network</p>
            </td>
        </tr>

        <!-- Alert Intro -->
        <tr>
            <td style="padding: 24px 24px 12px 24px; color: #1e293b;">
                <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 6px; margin-bottom: 20px;">
                    <p style="margin: 0; font-size: 15px; color: #991b1b; font-weight: 600;">
                        The user has activated an emergency SOS distress alert and may need immediate assistance.
                    </p>
                </div>

                <!-- User & Emergency Details Table -->
                <table width="100%" cellspacing="0" cellpadding="8" style="font-size: 14px; color: #334155; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td width="35%" style="font-weight: 700; color: #475569;">User:</td>
                        <td style="font-weight: 600; color: #0f172a;">${userName}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 700; color: #475569;">User Phone:</td>
                        <td><a href="tel:${userPhone}" style="color: #dc2626; text-decoration: none; font-weight: 600;">${userPhone}</a></td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 700; color: #475569;">User Email:</td>
                        <td><a href="mailto:${userEmail}" style="color: #2563eb; text-decoration: none;">${userEmail}</a></td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 700; color: #475569;">Emergency ID:</td>
                        <td style="font-family: monospace; font-size: 13px; color: #64748b; font-weight: 700;">${emergencyId || 'EMG_ALERT'}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 700; color: #475569;">Latitude:</td>
                        <td style="font-family: monospace;">${formattedLat}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 700; color: #475569;">Longitude:</td>
                        <td style="font-family: monospace;">${formattedLng}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="font-weight: 700; color: #475569;">Time:</td>
                        <td>${timeString}</td>
                    </tr>
                </table>

                <!-- FEATURE 1: Google Maps Location & Live Tracking Buttons -->
                <div style="margin: 24px 0 16px 0; text-align: center;">
                    ${finalGoogleMapsUrl ? `
                    <a href="${finalGoogleMapsUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 4px; box-shadow: 0 4px 10px rgba(37,99,235,0.25);">
                        📍 View Google Maps
                    </a>` : `
                    <div style="display: inline-block; background-color: #f1f5f9; color: #64748b; padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; margin: 4px;">
                        📍 Location could not be obtained
                    </div>`}

                    ${liveTracking ? `
                    <a href="${liveTracking}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 4px; box-shadow: 0 4px 10px rgba(234,88,12,0.25);">
                        📡 Live Tracking
                    </a>` : ''}

                    ${videoUrl ? `
                    <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #db2777; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 4px;">
                        🎥 Live Video
                    </a>` : ''}
                </div>

                <!-- FEATURE 2: Camera Evidence Photo Section -->
                <div style="margin: 22px 0; padding: 18px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; text-align: center;">
                    <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 16px; font-weight: 700;">
                        📸 Captured Camera Evidence
                    </h3>
                    ${hasPhoto ? `
                    ${hasPhotoAttachment ? `
                    <div style="margin: 12px 0;">
                        <img src="cid:sos_evidence_photo" alt="Captured Camera Evidence" style="max-width: 100%; max-height: 320px; border-radius: 8px; border: 1px solid #94a3b8; display: block; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.12);" />
                    </div>` : ''}
                    ${photoEvidenceUrl ? `
                    <div style="margin-top: 12px;">
                        <a href="${photoEvidenceUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 700; font-size: 13px; box-shadow: 0 2px 6px rgba(2,132,199,0.3);">
                            View / Download Evidence Photo (JPG)
                        </a>
                    </div>` : ''}
                    ` : `
                    <p style="margin: 0; font-size: 13px; color: #64748b; font-style: italic;">
                        No camera evidence photo available (Permission denied or camera unavailable).
                    </p>
                    `}
                </div>

                <!-- FEATURE 3: Emergency Ambient Voice Recording Section (5 Seconds) -->
                <div style="margin: 22px 0; padding: 18px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 10px; text-align: center;">
                    <h3 style="margin: 0 0 6px 0; color: #854d0e; font-size: 16px; font-weight: 700;">
                        🎙️ Emergency Ambient Voice Recording
                    </h3>
                    ${hasAudio ? `
                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #a16207; font-weight: 500;">
                        5-second emergency audio recording.
                    </p>
                    ${audioEvidenceUrl ? `
                    <div style="margin-top: 10px;">
                        <a href="${audioEvidenceUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #d97706; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 700; font-size: 13px; box-shadow: 0 2px 6px rgba(217,119,6,0.3);">
                            Play / Download Voice Note
                        </a>
                    </div>` : ''}
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #713f12; opacity: 0.9;">
                        (Audio file is also attached to this email as emergency_voice_note.webm)
                    </p>
                    ` : `
                    <p style="margin: 0; font-size: 13px; color: #a16207; font-style: italic;">
                        No emergency voice note available (Permission denied or microphone unavailable).
                    </p>
                    `}
                </div>

                <div style="background-color: #fff7ed; border: 1px dashed #fdba74; border-radius: 8px; padding: 14px; margin-top: 18px; text-align: center;">
                    <p style="margin: 0; font-size: 14px; color: #9a3412; font-weight: 700;">
                        Please contact the user and provide assistance immediately.
                    </p>
                </div>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 20px; text-align: center; font-size: 12px; color: #94a3b8;">
                FLARE Women Safety Emergency Network • Automatic Distress Dispatch
            </td>
        </tr>
    </table>
</body>
</html>`;

    const mailOptions = {
        from: `"FLARE Women Safety" <${process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: emailSubject,
        text: textBody,
        html: htmlBody,
        headers: {
            'X-Priority': '1', // High priority
            'X-MSMail-Priority': 'High',
            'Importance': 'High'
        }
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
    }

    try {
        console.log(`[Email Service] Sending emergency email to ${recipientEmail} via Resend API...`);
        const info = await sendWithResend({
    to: recipientEmail,
    subject: emailSubject,
    text: textBody,
    html: htmlBody,
    attachments: attachments || []
});

        console.log(`✅ [Email Service] Resend accepted the email request for ${recipientEmail} (ID: ${info.messageId})`);

        return {
            success: true,
            status: 'accepted_by_resend',
            messageId: info.messageId,
            recipient: recipientEmail,
            diagnostic: 'Resend accepted the email request; successful delivery to the recipient must be confirmed.'
        };
    } catch (err) {
        let cleanReason = err.message || 'Resend email delivery failed';
        if (err.code === 'EAUTH' || err.responseCode === 535) {
            cleanReason = 'SMTP Authentication failed. Verify EMAIL_USER and Gmail App Password.';
        } else if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
            cleanReason = 'SMTP connection timed out. Check network or Gmail SMTP server reachability.';
        }

        console.error(`❌ [Email Service] Failed delivery to ${recipientEmail}:`, cleanReason);

        return {
            success: false,
            status: 'failed',
            recipient: recipientEmail,
            error: `Email failed: ${cleanReason}`,
            errorCode: err.code || null
        };
    }
};

/**
 * Send OTP Verification Code via Email
 */
const sendOTPEmail = async (recipientEmail, otp, userName = 'User') => {
    if (!isValidEmail(recipientEmail)) {
        return {
            success: false,
            status: 'failed',
            error: `Invalid recipient email address: "${recipientEmail}"`
        };
    }

    if (!process.env.RESEND_API_KEY) {
    return {
        success: false,
        status: 'not_configured',
        recipient: recipientEmail,
        error: 'Email not sent: RESEND_API_KEY is missing.'
    };
}

    const mailOptions = {
        from: `"FLARE Women Safety" <${process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: `🔐 FLARE Security: Your Verification OTP is ${otp}`,
        text: `Hello ${userName},\n\nYour FLARE Women Safety verification code is: ${otp}\n\nThis OTP is valid for 5 minutes. Do not share this OTP with anyone for safety.\n\nThank you,\nFLARE Women Safety Team`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #ef4444; margin: 0;">FLARE Security</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Account Verification Code</p>
                </div>
                <p style="color: #334155; font-size: 14px;">Hello <strong>${userName}</strong>,</p>
                <p style="color: #334155; font-size: 14px;">Use the following One-Time Password (OTP) to complete your verification:</p>
                <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                    <span style="font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">${otp}</span>
                </div>
                <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">Valid for 5 minutes. Never share this code with anyone.</p>
            </div>
        `
    };

    try {
        const info = await sendWithResend({
    to: recipientEmail,
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html
});
        return {
            success: true,
            status: 'accepted_by_smtp',
            messageId: info.messageId,
            recipient: recipientEmail
        };
    } catch (err) {
        return {
            success: false,
            status: 'failed',
            error: err.message
        };
    }
};

module.exports = {
    isValidEmail,
    verifyEmailConfig,
    sendEmergencyEmail,
    sendOTPEmail
};

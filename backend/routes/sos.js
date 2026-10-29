const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authMiddleware } = require('./auth');
const Contact = require('../models/Contact');
const User = require('../models/User');
const Alert = require('../models/Alert');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const { sendSOSWhatsAppAlert, formatRecipientPhone, getWhatsAppProviderStatus } = require('../services/whatsappService');
const { sendSOS_SMS, formatPhoneE164, getSMSProviderStatus } = require('../services/smsService');
const { sendEmergencyEmail, isValidEmail } = require('../services/emailService');

// Map to track retry timestamps to prevent spam / duplicate alerts (30-second cooldown)
const retryCooldowns = new Map();

// Ensure evidence storage directory exists
const evidenceDir = path.join(__dirname, '../uploads/evidence');
if (!fs.existsSync(evidenceDir)) {
    try {
        fs.mkdirSync(evidenceDir, { recursive: true });
    } catch (e) {
        console.warn('Could not create evidence directory:', e.message);
    }
}

/**
 * Dispatch all configured channels for contacts for an alert
 */
const dispatchAllChannels = async (contacts, user, sosData, attachments = []) => {
    const { emergencyId } = sosData;

    // 1. WhatsApp Dispatch Promises
    const waContacts = contacts.filter(c => c.whatsappEnabled !== false && c.phone);
    const waPromises = waContacts.map(async (contact) => {
        const recipientDigits = formatRecipientPhone(contact.phone, contact.countryCode || user.countryCode);
        if (!recipientDigits) {
            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                channel: 'whatsapp',
                status: 'failed',
                error: `Invalid phone number format: "${contact.phone}"`
            };
        }

        try {
            const res = await sendSOSWhatsAppAlert(recipientDigits, sosData);
            const status = res.status || (res.success ? 'sent' : 'failed');

            // Save / Upsert in WhatsAppMessage collection
            try {
                const messageRecord = new WhatsAppMessage({
                    messageId: res.messageId || `wamid.local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    emergencyId,
                    userId: user._id,
                    contactId: contact._id,
                    recipientNumber: '+' + recipientDigits,
                    status: status,
                    failureReason: res.error || null,
                    sentAt: Date.now()
                });
                await messageRecord.save();
            } catch (dbErr) {
                console.error('Failed to log WhatsAppMessage to DB:', dbErr.message);
            }

            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                phone: '+' + recipientDigits,
                channel: 'whatsapp',
                status: status,
                simulated: Boolean(res.simulated),
                messageId: res.messageId || null,
                errorCode: res.errorCode || null,
                httpStatus: res.httpStatus || null,
                detail: res.detail || res.error || null,
                error: res.error || null
            };
        } catch (err) {
            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                channel: 'whatsapp',
                status: 'failed',
                error: err.message
            };
        }
    });

    // 2. SMS Dispatch Promises
    const smsContacts = contacts.filter(c => c.smsEnabled !== false && c.phone);
    const smsPromises = smsContacts.map(async (contact) => {
        try {
            const res = await sendSOS_SMS(contact, user, sosData);
            const status = res.status || (res.success ? 'submitted' : 'failed');

            contact.lastSmsSentAt = new Date();
            contact.lastSmsStatus = status;
            await contact.save().catch(() => {});

            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                phone: res.to || contact.phone,
                channel: 'sms',
                status: status,
                provider: res.provider || 'none',
                messageId: res.sid || res.messageId || null,
                errorCode: res.errorCode || null,
                httpStatus: res.httpStatus || null,
                detail: res.detail || res.error || null,
                error: res.error || null
            };
        } catch (err) {
            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                channel: 'sms',
                status: 'failed',
                error: err.message
            };
        }
    });

    // 3. Email Dispatch Promises with Google Maps, Live Tracking, Photo & Audio
    const emailContacts = contacts.filter(c => c.emailEnabled !== false && c.email && isValidEmail(c.email));
    const emailPromises = emailContacts.map(async (contact) => {
        try {
            const res = await sendEmergencyEmail({
                recipientEmail: contact.email,
                userName: user.name,
                userPhone: sosData.userPhone,
                userEmail: user.email,
                emergencyId: emergencyId.toString(),
                latitude: sosData.latitude,
                longitude: sosData.longitude,
                googleMapsUrl: sosData.googleMapsUrl,
                mapUrl: sosData.googleMapsUrl || sosData.mapUrl,
                timestamp: sosData.timestamp,
                trackingUrl: sosData.trackingUrl,
                videoUrl: sosData.videoUrl,
                photoEvidenceUrl: sosData.photoEvidenceUrl,
                audioEvidenceUrl: sosData.audioEvidenceUrl,
                attachments
            });

            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                email: contact.email,
                channel: 'email',
                status: res.status, // 'accepted_by_smtp' | 'failed' | 'not_configured'
                messageId: res.messageId || null,
                detail: res.diagnostic || res.error || null,
                error: res.error || null
            };
        } catch (err) {
            return {
                contactId: contact._id.toString(),
                contactName: contact.name,
                channel: 'email',
                status: 'failed',
                error: err.message
            };
        }
    });

    // Await all dispatches safely using Promise.allSettled
    const [waSettled, smsSettled, emailSettled] = await Promise.all([
        Promise.allSettled(waPromises),
        Promise.allSettled(smsPromises),
        Promise.allSettled(emailPromises)
    ]);

    const waResults = waSettled.map(s => s.status === 'fulfilled' ? s.value : { status: 'failed', error: s.reason?.message });
    const smsResults = smsSettled.map(s => s.status === 'fulfilled' ? s.value : { status: 'failed', error: s.reason?.message });
    const emailResults = emailSettled.map(s => s.status === 'fulfilled' ? s.value : { status: 'failed', error: s.reason?.message });

    // Aggregate summary statistics
    const summary = {
        totalContacts: contacts.length,
        whatsapp: {
            attempted: waContacts.length,
            sent: waResults.filter(r => r.status === 'sent').length,
            delivered: waResults.filter(r => r.status === 'delivered').length,
            simulated: waResults.filter(r => r.status === 'simulated').length,
            notConfigured: waResults.filter(r => r.status === 'not_configured').length,
            failed: waResults.filter(r => r.status === 'failed').length
        },
        sms: {
            attempted: smsContacts.length,
            submitted: smsResults.filter(r => r.status === 'submitted').length,
            delivered: smsResults.filter(r => r.status === 'delivered').length,
            notConfigured: smsResults.filter(r => r.status === 'not_configured').length,
            failed: smsResults.filter(r => r.status === 'failed').length
        },
        email: {
            attempted: emailContacts.length,
            acceptedBySmtp: emailResults.filter(r => r.status === 'accepted_by_smtp').length,
            notConfigured: emailResults.filter(r => r.status === 'not_configured').length,
            failed: emailResults.filter(r => r.status === 'failed').length
        }
    };

    // Combine by contact for frontend display
    const perContactResults = contacts.map(c => {
        const cId = c._id.toString();
        const wa = waResults.find(r => r.contactId === cId) || {
            status: c.whatsappEnabled === false ? 'disabled' : 'not_attempted',
            detail: c.whatsappEnabled === false ? 'WhatsApp disabled for contact' : 'No phone number'
        };
        const sms = smsResults.find(r => r.contactId === cId) || {
            status: c.smsEnabled === false ? 'disabled' : 'not_attempted',
            detail: c.smsEnabled === false ? 'SMS disabled for contact' : 'No phone number'
        };
        const email = emailResults.find(r => r.contactId === cId) || {
            status: c.emailEnabled === false ? 'disabled' : (isValidEmail(c.email) ? 'not_attempted' : 'invalid_email'),
            detail: c.emailEnabled === false ? 'Email disabled for contact' : (!c.email ? 'No email address' : 'Invalid email format')
        };

        return {
            contactId: cId,
            name: c.name,
            phone: c.phone,
            email: c.email,
            channels: {
                whatsapp: wa,
                sms: sms,
                email: email
            }
        };
    });

    return {
        summary,
        contacts: perContactResults
    };
};

/**
 * Common handler for SOS Activation (both POST / and POST /start)
 */
const handleSOSStart = async (req, res) => {
    try {
        const {
            latitude,
            longitude,
            accuracy,
            locationStatus: clientLocationStatus,
            evidence,
            audio,
            audioDurationSeconds = 5,
            videoActive
        } = req.body;

        // Parse coordinates safely without crashing if GPS was denied or unavailable
        let latNum = null;
        let lngNum = null;
        let hasValidCoords = false;

        if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
            const parsedLat = Number(latitude);
            const parsedLng = Number(longitude);
            if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180) {
                latNum = parsedLat;
                lngNum = parsedLng;
                hasValidCoords = true;
            }
        }

        const effectiveLocationStatus = hasValidCoords
            ? (clientLocationStatus === 'last_known' ? 'last_known' : 'acquired')
            : 'unavailable';

        const locationAccuracy = accuracy ? Number(accuracy) : null;

        // Validate User
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User profile not found.' });
        }

        // Retrieve Emergency Contacts
        const contacts = await Contact.find({ user: req.user.id });

        const now = Date.now();
        const liveTrackingSessionId = `TRK_${now}_${Math.random().toString(36).substring(2, 8)}`;

        // 1. Create or update Alert in database
        let alertRecord;
        try {
            alertRecord = await Alert.findOneAndUpdate(
                { user: req.user.id, active: true },
                {
                    latitude: latNum,
                    longitude: lngNum,
                    locationAccuracy,
                    locationStatus: effectiveLocationStatus,
                    locationTimestamp: new Date(),
                    active: true,
                    status: 'ACTIVE',
                    liveTrackingSessionId,
                    createdAt: now,
                    endedAt: null,
                    audioDurationSeconds: audioDurationSeconds || 5,
                    ...(evidence && { evidence }),
                    ...(audio && { audio }),
                    $push: {
                        trackingUpdates: hasValidCoords ? {
                            latitude: latNum,
                            longitude: lngNum,
                            accuracy: locationAccuracy,
                            timestamp: new Date()
                        } : undefined
                    }
                },
                { upsert: true, new: true }
            );
        } catch (alertErr) {
            console.error('Failed to create/update alert in DB:', alertErr);
        }

        const emergencyId = alertRecord ? alertRecord._id.toString() : `EMG_${now}`;
        const hostHeader = req.get('host') || 'localhost:5000';
        const protocol = req.protocol || 'http';
        const baseUrl = `${protocol}://${hostHeader}`;

        // Feature 1: Google Maps Link (https://www.google.com/maps?q=LATITUDE,LONGITUDE)
        const googleMapsUrl = hasValidCoords ? `https://www.google.com/maps?q=${latNum},${lngNum}` : null;
        const osmMapLink = hasValidCoords ? `https://www.openstreetmap.org/?mlat=${latNum}&mlon=${lngNum}#map=17/${latNum}/${lngNum}` : null;
        const trackingUrl = `${baseUrl}/tracking.html?id=${emergencyId}`;
        const videoUrl = videoActive ? `${baseUrl}/#video?alertId=${emergencyId}` : null;

        // Feature 2: Save Photo Evidence File to Disk if captured
        let evidenceFileName = null;
        let photoEvidenceUrl = null;
        if (evidence && typeof evidence === 'string' && evidence.includes('base64,')) {
            try {
                const parts = evidence.split('base64,');
                evidenceFileName = `photo_${emergencyId}.jpg`;
                fs.writeFileSync(path.join(evidenceDir, evidenceFileName), Buffer.from(parts[1], 'base64'));
                photoEvidenceUrl = `${baseUrl}/api/sos/evidence/${emergencyId}/photo`;
            } catch (fsErr) {
                console.warn('Failed saving evidence photo to disk:', fsErr.message);
            }
        }

        // Feature 3: Save 5-Second Audio Recording File to Disk if recorded
        let audioFileName = null;
        let audioEvidenceUrl = null;
        if (audio && typeof audio === 'string' && audio.includes('base64,')) {
            try {
                const parts = audio.split('base64,');
                audioFileName = `emergency_${emergencyId}.webm`;
                fs.writeFileSync(path.join(evidenceDir, audioFileName), Buffer.from(parts[1], 'base64'));
                audioEvidenceUrl = `${baseUrl}/api/sos/evidence/${emergencyId}/audio`;
            } catch (fsErr) {
                console.warn('Failed saving audio recording to disk:', fsErr.message);
            }
        }

        // Update Alert Document with Evidence and URLs
        if (alertRecord) {
            alertRecord.googleMapsUrl = googleMapsUrl;
            alertRecord.liveTrackingUrl = trackingUrl;
            alertRecord.photoEvidenceUrl = photoEvidenceUrl;
            alertRecord.audioEvidenceUrl = audioEvidenceUrl;
            alertRecord.audioDurationSeconds = audioDurationSeconds || 5;
            if (evidenceFileName) alertRecord.evidenceFile = evidenceFileName;
            if (audioFileName) alertRecord.audioFile = audioFileName;
            alertRecord.evidenceMetadata = {
                photoCaptured: Boolean(evidenceFileName || evidence),
                photoUploadedAt: evidence ? new Date() : null,
                audioRecorded: Boolean(audioFileName || audio),
                audioUploadedAt: audio ? new Date() : null,
                audioDurationSeconds: audioDurationSeconds || 5
            };
            await alertRecord.save().catch(() => {});
        }

        // Build Email Attachments (Photo CID + 5s WebM Audio CID)
        const attachments = [];
        if (evidence && typeof evidence === 'string' && evidence.includes('base64,')) {
            const parts = evidence.split('base64,');
            attachments.push({
                filename: `sos_evidence_photo_${emergencyId}.jpg`,
                content: Buffer.from(parts[1], 'base64'),
                contentType: 'image/jpeg',
                cid: 'sos_evidence_photo'
            });
        }

        if (audio && typeof audio === 'string' && audio.includes('base64,')) {
            const parts = audio.split('base64,');
            const mimeMatch = audio.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,/);
            const audioMime = mimeMatch ? mimeMatch[1] : 'audio/webm';
            attachments.push({
                filename: `emergency_voice_note.webm`,
                content: Buffer.from(parts[1], 'base64'),
                contentType: audioMime,
                cid: 'sos_ambient_audio'
            });
        }

        const userPhoneFormatted = formatPhoneE164(user.phone, user.countryCode) || user.phone;
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const sosData = {
            userName: user.name,
            userPhone: userPhoneFormatted,
            userEmail: user.email,
            latitude: latNum,
            longitude: lngNum,
            googleMapsUrl,
            mapUrl: googleMapsUrl || osmMapLink,
            emergencyId,
            trackingUrl,
            videoUrl,
            photoEvidenceUrl,
            audioEvidenceUrl,
            timestamp
        };

        console.log(`\n===============================================================`);
        console.log(`🚨 [SOS DISPATCH] Activated by ${user.name} (${userPhoneFormatted})`);
        console.log(`• Emergency ID: ${emergencyId}`);
        console.log(`• Location: ${hasValidCoords ? `[${latNum}, ${lngNum}] (${effectiveLocationStatus})` : 'UNAVAILABLE'}`);
        console.log(`• Google Maps: ${googleMapsUrl || 'None'}`);
        console.log(`• Photo Evidence: ${evidenceFileName ? 'Captured & Attached' : 'None'}`);
        console.log(`• Audio Note: ${audioFileName ? '5-Second Recording Attached' : 'None'}`);
        console.log(`• Contacts to notify: ${contacts ? contacts.length : 0}`);
        console.log(`===============================================================\n`);

        let dispatchResult = {
            summary: {
                totalContacts: contacts ? contacts.length : 0,
                whatsapp: { attempted: 0, sent: 0, delivered: 0, simulated: 0, notConfigured: 0, failed: 0 },
                sms: { attempted: 0, submitted: 0, delivered: 0, notConfigured: 0, failed: 0 },
                email: { attempted: 0, acceptedBySmtp: 0, notConfigured: 0, failed: 0 }
            },
            contacts: []
        };

        if (contacts && contacts.length > 0) {
            dispatchResult = await dispatchAllChannels(contacts, user, sosData, attachments);
            
            // Persist notification outcomes in Alert record
            if (alertRecord) {
                try {
                    alertRecord.notificationResults = dispatchResult;
                    await alertRecord.save();
                } catch (saveErr) {
                    console.error('Error saving notificationResults to alert:', saveErr.message);
                }
            }
        }

        return res.json({
            msg: `EMERGENCY SOS ALERT ACTIVATED!`,
            emergencyId,
            status: 'ACTIVE',
            timestamp,
            locationStatus: effectiveLocationStatus,
            latitude: latNum,
            longitude: lngNum,
            locationAccuracy,
            googleMapsUrl,
            photoEvidenceUrl,
            audioEvidenceUrl,
            user: {
                name: user.name,
                phone: userPhoneFormatted
            },
            summary: dispatchResult.summary,
            contacts: dispatchResult.contacts,
            trackingUrl,
            videoUrl,
            mapUrl: googleMapsUrl || osmMapLink,
            hasContacts: Boolean(contacts && contacts.length > 0),
            noContactsNotice: (!contacts || contacts.length === 0) ? 'Notice: No emergency contacts saved. Please add emergency contacts to receive alerts.' : null
        });

    } catch (err) {
        console.error('SOS dispatch root error:', err);
        return res.status(500).json({ msg: 'Server error processing SOS alert: ' + err.message });
    }
};

/**
 * 1. TRIGGER SOS ROUTE
 * POST /api/sos and POST /api/sos/start
 */
router.post('/', authMiddleware, handleSOSStart);
router.post('/start', authMiddleware, handleSOSStart);

/**
 * 2. LIVE LOCATION TRACKING UPDATE ROUTE
 * POST /api/sos/track/:emergencyId
 */
router.post('/track/:emergencyId', authMiddleware, async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const { latitude, longitude, accuracy } = req.body;

        const latNum = Number(latitude);
        const lngNum = Number(longitude);

        if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
            return res.status(400).json({ msg: 'Invalid coordinates provided for live tracking update.' });
        }

        const alert = await Alert.findById(emergencyId);
        if (!alert) {
            return res.status(404).json({ msg: 'Emergency session not found.' });
        }

        if (alert.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized to update tracking for this emergency.' });
        }

        alert.latitude = latNum;
        alert.longitude = lngNum;
        alert.googleMapsUrl = `https://www.google.com/maps?q=${latNum},${lngNum}`;
        if (accuracy) alert.locationAccuracy = Number(accuracy);
        alert.locationStatus = 'acquired';
        alert.locationTimestamp = new Date();

        if (!alert.trackingUpdates) alert.trackingUpdates = [];
        alert.trackingUpdates.push({
            latitude: latNum,
            longitude: lngNum,
            accuracy: accuracy ? Number(accuracy) : null,
            timestamp: new Date()
        });

        await alert.save();

        res.json({
            msg: 'Live tracking position updated.',
            emergencyId,
            latitude: latNum,
            longitude: lngNum,
            accuracy: alert.locationAccuracy,
            googleMapsUrl: alert.googleMapsUrl,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Live tracking update error:', err);
        res.status(500).json({ msg: 'Server error updating tracking location: ' + err.message });
    }
});

/**
 * 3. GET LIVE TRACKING DATA (For responders / contacts opening tracking link)
 * GET /api/sos/track/:emergencyId
 */
router.get('/track/:emergencyId', async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const alert = await Alert.findById(emergencyId).populate('user', 'name phone');

        if (!alert) {
            return res.status(404).json({ msg: 'Emergency session not found or has expired.' });
        }

        res.json({
            emergencyId,
            user: {
                name: alert.user?.name || 'Protected User',
                phone: alert.user?.phone || 'Confidential'
            },
            active: alert.active,
            status: alert.status || (alert.active ? 'ACTIVE' : 'RESOLVED'),
            latitude: alert.latitude,
            longitude: alert.longitude,
            accuracy: alert.locationAccuracy,
            locationStatus: alert.locationStatus || 'acquired',
            googleMapsUrl: alert.googleMapsUrl || (alert.latitude && alert.longitude ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}` : null),
            photoEvidenceUrl: alert.photoEvidenceUrl,
            audioEvidenceUrl: alert.audioEvidenceUrl,
            createdAt: alert.createdAt,
            endedAt: alert.endedAt,
            trackingUpdates: alert.trackingUpdates || []
        });
    } catch (err) {
        console.error('Get live tracking error:', err);
        res.status(500).json({ msg: 'Server error retrieving live tracking data: ' + err.message });
    }
});

/**
 * 4. END EMERGENCY / RESOLVE SOS ROUTE
 * POST /api/sos/end/:emergencyId and POST /api/sos/end
 */
const handleEndEmergency = async (req, res) => {
    try {
        const emergencyId = req.params.emergencyId || req.body.emergencyId;
        let alert;

        if (emergencyId) {
            alert = await Alert.findById(emergencyId);
        } else {
            alert = await Alert.findOne({ user: req.user.id, active: true }).sort({ createdAt: -1 });
        }

        if (!alert) {
            return res.json({ msg: 'No active emergency session found.', resolved: true });
        }

        if (alert.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized to resolve this emergency.' });
        }

        alert.active = false;
        alert.status = 'RESOLVED';
        alert.endedAt = new Date();
        await alert.save();

        console.log(`\n===============================================================`);
        console.log(`🛡️ [EMERGENCY RESOLVED] Alert ${alert._id} marked as RESOLVED by user.`);
        console.log(`===============================================================\n`);

        res.json({
            msg: 'Emergency session successfully resolved. Glad you are safe!',
            emergencyId: alert._id.toString(),
            status: 'RESOLVED',
            endedAt: alert.endedAt
        });
    } catch (err) {
        console.error('End emergency error:', err);
        res.status(500).json({ msg: 'Server error ending emergency: ' + err.message });
    }
};

router.post('/end', authMiddleware, handleEndEmergency);
router.post('/end/:emergencyId', authMiddleware, handleEndEmergency);

/**
 * 5. UPLOAD ASYNC EVIDENCE (Photo/Audio)
 * POST /api/sos/evidence/:emergencyId
 */
router.post('/evidence/:emergencyId', authMiddleware, async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const { evidence, audio, audioDurationSeconds = 5 } = req.body;

        const alert = await Alert.findById(emergencyId);
        if (!alert) {
            return res.status(404).json({ msg: 'Emergency session not found.' });
        }

        if (alert.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized.' });
        }

        const user = await User.findById(req.user.id);
        const hostHeader = req.get('host') || 'localhost:5000';
        const protocol = req.protocol || 'http';
        const baseUrl = `${protocol}://${hostHeader}`;

        let photoSaved = false;
        let audioSaved = false;
        const attachments = [];

        if (evidence && typeof evidence === 'string' && evidence.includes('base64,')) {
            try {
                const parts = evidence.split('base64,');
                const photoFileName = `photo_${emergencyId}.jpg`;
                fs.writeFileSync(path.join(evidenceDir, photoFileName), Buffer.from(parts[1], 'base64'));
                alert.evidenceFile = photoFileName;
                alert.evidence = evidence;
                alert.photoEvidenceUrl = `${baseUrl}/api/sos/evidence/${emergencyId}/photo`;
                alert.evidenceMetadata.photoCaptured = true;
                alert.evidenceMetadata.photoUploadedAt = new Date();
                photoSaved = true;

                attachments.push({
                    filename: `sos_evidence_photo_${emergencyId}.jpg`,
                    content: Buffer.from(parts[1], 'base64'),
                    contentType: 'image/jpeg',
                    cid: 'sos_evidence_photo'
                });
            } catch (pErr) {
                console.warn('Failed saving evidence photo:', pErr.message);
            }
        }

        if (audio && typeof audio === 'string' && audio.includes('base64,')) {
            try {
                const parts = audio.split('base64,');
                const audioFileName = `emergency_${emergencyId}.webm`;
                fs.writeFileSync(path.join(evidenceDir, audioFileName), Buffer.from(parts[1], 'base64'));
                alert.audioFile = audioFileName;
                alert.audio = audio;
                alert.audioEvidenceUrl = `${baseUrl}/api/sos/evidence/${emergencyId}/audio`;
                alert.audioDurationSeconds = audioDurationSeconds || 5;
                alert.evidenceMetadata.audioRecorded = true;
                alert.evidenceMetadata.audioUploadedAt = new Date();
                alert.evidenceMetadata.audioDurationSeconds = audioDurationSeconds || 5;
                audioSaved = true;

                const mimeMatch = audio.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,/);
                const audioMime = mimeMatch ? mimeMatch[1] : 'audio/webm';
                attachments.push({
                    filename: `emergency_voice_note.webm`,
                    content: Buffer.from(parts[1], 'base64'),
                    contentType: audioMime,
                    cid: 'sos_ambient_audio'
                });
            } catch (aErr) {
                console.warn('Failed saving evidence audio:', aErr.message);
            }
        }

        await alert.save();

        // Dispatch updated follow-up email with evidence to email contacts
        if (attachments.length > 0 && user) {
            try {
                const contacts = await Contact.find({ user: req.user.id, emailEnabled: { $ne: false } });
                const emailContacts = contacts.filter(c => c.email && isValidEmail(c.email));

                const googleMapsUrl = (alert.latitude && alert.longitude)
                    ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
                    : null;
                const trackingUrl = `${baseUrl}/tracking.html?id=${emergencyId}`;

                for (const c of emailContacts) {
                    sendEmergencyEmail({
                        recipientEmail: c.email,
                        userName: user.name,
                        userPhone: user.phone,
                        userEmail: user.email,
                        emergencyId: emergencyId.toString(),
                        latitude: alert.latitude,
                        longitude: alert.longitude,
                        googleMapsUrl,
                        mapUrl: googleMapsUrl,
                        trackingUrl,
                        photoEvidenceUrl: alert.photoEvidenceUrl,
                        audioEvidenceUrl: alert.audioEvidenceUrl,
                        attachments
                    }).catch(e => console.warn(`Follow-up email error to ${c.email}:`, e.message));
                }
            } catch (mailFollowErr) {
                console.warn('Evidence follow-up email dispatch notice:', mailFollowErr.message);
            }
        }

        res.json({
            msg: 'Evidence attached and synchronized successfully.',
            emergencyId,
            photoSaved,
            audioSaved,
            photoEvidenceUrl: alert.photoEvidenceUrl,
            audioEvidenceUrl: alert.audioEvidenceUrl,
            evidenceMetadata: alert.evidenceMetadata
        });
    } catch (err) {
        console.error('Evidence upload error:', err);
        res.status(500).json({ msg: 'Server error attaching evidence: ' + err.message });
    }
});

/**
 * 6. RETRIEVE EVIDENCE FILE (Accessible for emergency contacts viewing from email)
 * GET /api/sos/evidence/:emergencyId/:type (type: photo | audio)
 */
router.get('/evidence/:emergencyId/:type', async (req, res) => {
    try {
        const { emergencyId, type } = req.params;
        const alert = await Alert.findById(emergencyId).catch(() => null);

        if (!alert) {
            return res.status(404).send('Emergency record not found or has expired.');
        }

        // Return Photo Evidence
        if (type === 'photo') {
            if (alert.evidenceFile) {
                const filePath = path.join(evidenceDir, alert.evidenceFile);
                if (fs.existsSync(filePath)) {
                    res.setHeader('Content-Type', alert.photoMimeType || 'image/jpeg');
                    res.setHeader('Content-Disposition', `inline; filename="evidence_${emergencyId}.jpg"`);
                    return fs.createReadStream(filePath).pipe(res);
                }
            }

            if (alert.evidence && alert.evidence.includes('base64,')) {
                const parts = alert.evidence.split('base64,');
                res.setHeader('Content-Type', alert.photoMimeType || 'image/jpeg');
                res.setHeader('Content-Disposition', `inline; filename="evidence_${emergencyId}.jpg"`);
                return res.send(Buffer.from(parts[1], 'base64'));
            }
        }

        // Return Audio Evidence (5-Second Voice Note)
        if (type === 'audio') {
            if (alert.audioFile) {
                const filePath = path.join(evidenceDir, alert.audioFile);
                if (fs.existsSync(filePath)) {
                    res.setHeader('Content-Type', alert.audioMimeType || 'audio/webm');
                    res.setHeader('Content-Disposition', `inline; filename="emergency_voice_note_${emergencyId}.webm"`);
                    return fs.createReadStream(filePath).pipe(res);
                }
            }

            if (alert.audio && alert.audio.includes('base64,')) {
                const parts = alert.audio.split('base64,');
                res.setHeader('Content-Type', alert.audioMimeType || 'audio/webm');
                res.setHeader('Content-Disposition', `inline; filename="emergency_voice_note_${emergencyId}.webm"`);
                return res.send(Buffer.from(parts[1], 'base64'));
            }
        }

        return res.status(404).send(`No ${type} evidence available for this emergency.`);
    } catch (err) {
        console.error('Fetch evidence error:', err);
        res.status(500).send('Server error retrieving evidence: ' + err.message);
    }
});

/**
 * 7. GET SOS LIVE STATUS ROUTE
 * GET /api/sos/status/:emergencyId
 */
router.get('/status/:emergencyId', authMiddleware, async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const alert = await Alert.findById(emergencyId);

        if (!alert) {
            return res.status(404).json({ msg: 'Emergency alert not found' });
        }

        const contacts = await Contact.find({ user: alert.user });
        const waMessages = await WhatsAppMessage.find({ emergencyId });

        res.json({
            emergencyId,
            active: alert.active,
            status: alert.status || (alert.active ? 'ACTIVE' : 'RESOLVED'),
            createdAt: alert.createdAt,
            endedAt: alert.endedAt,
            latitude: alert.latitude,
            longitude: alert.longitude,
            locationAccuracy: alert.locationAccuracy,
            locationStatus: alert.locationStatus || 'acquired',
            googleMapsUrl: alert.googleMapsUrl,
            photoEvidenceUrl: alert.photoEvidenceUrl,
            audioEvidenceUrl: alert.audioEvidenceUrl,
            audioDurationSeconds: alert.audioDurationSeconds || 5,
            evidenceMetadata: alert.evidenceMetadata,
            notificationResults: alert.notificationResults || {},
            whatsAppMessages: waMessages.map(m => ({
                id: m._id,
                messageId: m.messageId,
                recipientNumber: m.recipientNumber,
                status: m.status,
                failureReason: m.failureReason,
                sentAt: m.sentAt,
                deliveredAt: m.deliveredAt,
                readAt: m.readAt
            })),
            contacts: contacts.map(c => ({
                id: c._id,
                name: c.name,
                phone: c.phone,
                email: c.email,
                lastSmsStatus: c.lastSmsStatus || 'none',
                lastSmsSentAt: c.lastSmsSentAt || null,
                whatsappEnabled: c.whatsappEnabled !== false,
                smsEnabled: c.smsEnabled !== false,
                emailEnabled: c.emailEnabled !== false
            }))
        });
    } catch (err) {
        console.error('Get SOS status error:', err);
        res.status(500).json({ msg: 'Server error fetching SOS status' });
    }
});

/**
 * 8. RETRY FAILED NOTIFICATIONS ROUTE
 * POST /api/sos/retry/:emergencyId
 */
router.post('/retry/:emergencyId', authMiddleware, async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const alert = await Alert.findById(emergencyId);

        if (!alert) {
            return res.status(404).json({ msg: 'Emergency alert not found' });
        }

        if (alert.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized to manage this alert' });
        }

        // Retry cooldown protection (30s)
        const lastRetry = retryCooldowns.get(emergencyId);
        if (lastRetry && Date.now() - lastRetry < 30000) {
            const secondsWait = Math.ceil((30000 - (Date.now() - lastRetry)) / 1000);
            return res.status(429).json({
                msg: `Please wait ${secondsWait}s before retrying alerts to prevent duplicate notifications.`
            });
        }
        retryCooldowns.set(emergencyId, Date.now());

        const user = await User.findById(req.user.id);
        const contacts = await Contact.find({ user: req.user.id });

        const hostHeader = req.get('host') || 'localhost:5000';
        const protocol = req.protocol || 'http';
        const baseUrl = `${protocol}://${hostHeader}`;
        const trackingUrl = `${baseUrl}/tracking.html?id=${emergencyId}`;
        const userPhoneFormatted = formatPhoneE164(user.phone, user.countryCode) || user.phone;

        let googleMapsUrl = null;
        if (alert.latitude && alert.longitude) {
            googleMapsUrl = `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`;
        }

        const sosData = {
            userName: user.name,
            userPhone: userPhoneFormatted,
            userEmail: user.email,
            latitude: alert.latitude,
            longitude: alert.longitude,
            googleMapsUrl,
            mapUrl: googleMapsUrl,
            emergencyId,
            trackingUrl,
            photoEvidenceUrl: alert.photoEvidenceUrl,
            audioEvidenceUrl: alert.audioEvidenceUrl,
            timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        };

        const attachments = [];
        if (alert.evidenceFile && fs.existsSync(path.join(evidenceDir, alert.evidenceFile))) {
            attachments.push({
                filename: `sos_evidence_photo_${emergencyId}.jpg`,
                path: path.join(evidenceDir, alert.evidenceFile),
                contentType: 'image/jpeg',
                cid: 'sos_evidence_photo'
            });
        }
        if (alert.audioFile && fs.existsSync(path.join(evidenceDir, alert.audioFile))) {
            attachments.push({
                filename: `emergency_voice_note.webm`,
                path: path.join(evidenceDir, alert.audioFile),
                contentType: 'audio/webm',
                cid: 'sos_ambient_audio'
            });
        }

        const retryResult = await dispatchAllChannels(contacts, user, sosData, attachments);

        // Update notificationResults
        alert.notificationResults = retryResult;
        await alert.save().catch(() => {});

        res.json({
            msg: 'Retry completed for emergency contacts.',
            emergencyId,
            summary: retryResult.summary,
            contacts: retryResult.contacts
        });
    } catch (err) {
        console.error('Retry SOS error:', err);
        res.status(500).json({ msg: 'Server error retrying SOS alerts: ' + err.message });
    }
});

module.exports = router;

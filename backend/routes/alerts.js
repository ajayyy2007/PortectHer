const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./auth');
const Alert = require('../models/Alert');
const User = require('../models/User');
const Contact = require('../models/Contact');
const { sendEmergencyEmail, isValidEmail } = require('../services/emailService');

// Get all active alerts (for community map)
router.get('/', async (req, res) => {
    try {
        const activeAlerts = await Alert.find({ active: true })
                                        .populate('user', 'name')
                                        .sort({ createdAt: -1 })
                                        .limit(50);
        res.json(activeAlerts);
    } catch (err) {
        console.error('Fetch alerts error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Cancel/Resolve User's active alert
router.post('/resolve', authMiddleware, async (req, res) => {
    try {
        await Alert.updateMany(
            { user: req.user.id, active: true },
            { 
                active: false,
                status: 'RESOLVED',
                endedAt: new Date()
            }
        );
        res.json({ msg: 'Alerts resolved successfully' });
    } catch (err) {
        console.error('Resolve alerts error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Post Evidence to Active Alert
router.post('/evidence', authMiddleware, async (req, res) => {
    try {
        const { evidenceData } = req.body;
        const updateFields = {};

        if (typeof evidenceData === 'string') {
            updateFields.evidence = evidenceData;
        } else if (typeof evidenceData === 'object' && evidenceData !== null) {
            if (evidenceData.evidence) updateFields.evidence = evidenceData.evidence;
            if (evidenceData.audio) updateFields.audio = evidenceData.audio;
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ msg: 'No evidence or audio provided' });
        }

        // Update the most recent active alert for this user
        const alert = await Alert.findOneAndUpdate(
            { user: req.user.id, active: true },
            { $set: updateFields },
            { sort: { createdAt: -1 }, new: true }
        );
        if (!alert) return res.status(404).json({ msg: 'No active alert found' });

        // Dispatch follow-up email with evidence if email is configured
        try {
            const user = await User.findById(req.user.id);
            const contacts = await Contact.find({ user: req.user.id, emailEnabled: { $ne: false } });
            const emailContacts = contacts.filter(c => c.email && isValidEmail(c.email));

            if (user && emailContacts.length > 0) {
                const attachments = [];
                let imageExt = 'jpg';

                if (updateFields.evidence && typeof updateFields.evidence === 'string' && updateFields.evidence.includes('base64,')) {
                    const parts = updateFields.evidence.split('base64,');
                    const mimeMatch = updateFields.evidence.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                    if (contentType.includes('png')) imageExt = 'png';
                    else if (contentType.includes('webp')) imageExt = 'webp';

                    const imageBuffer = Buffer.from(parts[1], 'base64');
                    attachments.push({
                        filename: `sos_evidence_photo_${Date.now()}.${imageExt}`,
                        content: imageBuffer,
                        contentType,
                        cid: 'sos_evidence_photo'
                    });
                }

                if (updateFields.audio && typeof updateFields.audio === 'string' && updateFields.audio.includes('base64,')) {
                    const parts = updateFields.audio.split('base64,');
                    const mimeMatch = updateFields.audio.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,/);
                    let audioContentType = mimeMatch ? mimeMatch[1] : 'audio/webm';
                    let audioExt = 'webm';
                    if (audioContentType.includes('wav')) audioExt = 'wav';
                    else if (audioContentType.includes('mp3') || audioContentType.includes('mpeg')) audioExt = 'mp3';
                    else if (audioContentType.includes('ogg')) audioExt = 'ogg';

                    const audioBuffer = Buffer.from(parts[1], 'base64');
                    attachments.push({
                        filename: `sos_voice_note_${Date.now()}.${audioExt}`,
                        content: audioBuffer,
                        contentType: audioContentType,
                        cid: 'sos_ambient_audio'
                    });
                }

                if (attachments.length > 0) {
                    const hostHeader = req.get('host') || 'localhost:5000';
                    const protocol = req.protocol || 'http';
                    const baseUrl = `${protocol}://${hostHeader}`;
                    const trackingUrl = `${baseUrl}/#dashboard?alertId=${alert._id}`;

                    for (const contact of emailContacts) {
                        sendEmergencyEmail({
                            recipientEmail: contact.email,
                            userName: user.name,
                            userPhone: user.phone,
                            userEmail: user.email,
                            emergencyId: alert._id.toString(),
                            latitude: alert.latitude,
                            longitude: alert.longitude,
                            mapUrl: `https://www.google.com/maps/place/${alert.latitude},${alert.longitude}`,
                            trackingUrl,
                            attachments
                        }).catch(e => console.warn(`Follow-up email error for ${contact.email}:`, e.message));
                    }
                }
            }
        } catch (eErr) {
            console.error('Follow-up evidence email error:', eErr.message);
        }

        res.json({ msg: 'Evidence added and synchronized successfully' });
    } catch (err) {
        console.error('Add evidence error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

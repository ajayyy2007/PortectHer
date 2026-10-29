const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const WhatsAppMessage = require('../models/WhatsAppMessage');

/**
 * Webhook Verification Challenge (GET)
 * Meta WhatsApp Cloud API calls this URL when configuring Webhook in Meta Developer Dashboard.
 */
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'women_safety_webhook_secret';

    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('✅ [WhatsApp Webhook] Verification Challenge successful.');
            return res.status(200).send(challenge);
        } else {
            console.warn('❌ [WhatsApp Webhook] Verification failed: Token mismatch.');
            return res.sendStatus(403);
        }
    }

    return res.status(400).send('Missing hub.mode or hub.verify_token');
});

/**
 * Helper to verify Meta X-Hub-Signature-256 if APP_SECRET is configured
 */
const verifySignature = (req) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) return true; // Optional if not set

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', appSecret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
};

/**
 * Incoming Webhook Status Notifications (POST)
 * Receives real-time delivery statuses (sent, delivered, read, failed) from Meta.
 */
router.post('/', async (req, res) => {
    try {
        if (!verifySignature(req)) {
            console.warn('❌ [WhatsApp Webhook] Invalid signature from Meta.');
            return res.status(401).send('Invalid signature');
        }

        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            const entries = body.entry || [];

            for (const entry of entries) {
                const changes = entry.changes || [];
                for (const change of changes) {
                    const value = change.value;
                    if (value && value.statuses) {
                        for (const statusObj of value.statuses) {
                            const messageId = statusObj.id;
                            const status = statusObj.status; // sent, delivered, read, failed
                            const timestamp = statusObj.timestamp ? new Date(statusObj.timestamp * 1000) : new Date();

                            const updateFields = { status };

                            if (status === 'sent') updateFields.sentAt = timestamp;
                            if (status === 'delivered') updateFields.deliveredAt = timestamp;
                            if (status === 'read') updateFields.readAt = timestamp;

                            if (status === 'failed' && statusObj.errors && statusObj.errors.length > 0) {
                                updateFields.failureReason = statusObj.errors[0].title || statusObj.errors[0].message;
                            }

                            const updatedMsg = await WhatsAppMessage.findOneAndUpdate(
                                { messageId },
                                { $set: updateFields },
                                { new: true }
                            );

                            if (updatedMsg) {
                                console.log(`📌 [WhatsApp Status Webhook] Message ${messageId} -> ${status.toUpperCase()}`);
                            }
                        }
                    }
                }
            }

            return res.status(200).send('EVENT_RECEIVED');
        } else {
            return res.sendStatus(404);
        }
    } catch (err) {
        console.error('WhatsApp Webhook Error:', err.message);
        return res.status(500).send('Webhook processing error');
    }
});

/**
 * Get delivery statuses of WhatsApp messages for an emergency ID
 */
router.get('/status/:emergencyId', async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const messages = await WhatsAppMessage.find({ emergencyId }).populate('contactId', 'name phone');
        res.json({
            emergencyId,
            messages
        });
    } catch (err) {
        res.status(500).json({ msg: 'Error fetching WhatsApp statuses' });
    }
});

module.exports = router;

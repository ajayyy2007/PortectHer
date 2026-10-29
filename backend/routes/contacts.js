const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const User = require('../models/User');
const { authMiddleware } = require('./auth');
const { sendDirectContactSMS, formatPhoneE164 } = require('../services/smsService');
const { isValidEmail } = require('../services/emailService');

// Get all contacts for a user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const contacts = await Contact.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(contacts);
    } catch (err) {
        console.error('Fetch contacts error:', err.message);
        res.status(500).json({ msg: 'Server Error fetching contacts' });
    }
});

// Add new contact
router.post('/', authMiddleware, async (req, res) => {
    const { name, email, phone, countryCode, relation, whatsappEnabled, smsEnabled, emailEnabled } = req.body;

    if (!name || !phone || !email) {
        return res.status(400).json({ msg: 'Please provide contact name, phone, and email.' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address for the contact.' });
    }

    const formattedPhone = formatPhoneE164(phone, countryCode || '+91');
    if (!formattedPhone) {
        return res.status(400).json({ msg: 'Please provide a valid phone number with 10 digits.' });
    }

    try {
        const newContact = new Contact({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            countryCode: countryCode || '+91',
            relation: relation || 'Emergency Contact',
            whatsappEnabled: whatsappEnabled !== undefined ? Boolean(whatsappEnabled) : true,
            smsEnabled: smsEnabled !== undefined ? Boolean(smsEnabled) : true,
            emailEnabled: emailEnabled !== undefined ? Boolean(emailEnabled) : true,
            user: req.user.id
        });

        const contact = await newContact.save();
        res.json(contact);
    } catch (err) {
        console.error('Add contact error:', err.message);
        res.status(500).json({ msg: 'Server Error adding contact' });
    }
});

// Update contact
router.put('/:id', authMiddleware, async (req, res) => {
    const { name, email, phone, countryCode, relation, whatsappEnabled, smsEnabled, emailEnabled } = req.body;

    const contactFields = {};
    if (name !== undefined) contactFields.name = name.trim();
    if (email !== undefined) {
        if (!isValidEmail(email)) {
            return res.status(400).json({ msg: 'Invalid email address.' });
        }
        contactFields.email = email.trim().toLowerCase();
    }
    if (phone !== undefined) contactFields.phone = phone.trim();
    if (countryCode !== undefined) contactFields.countryCode = countryCode;
    if (relation !== undefined) contactFields.relation = relation;
    if (whatsappEnabled !== undefined) contactFields.whatsappEnabled = Boolean(whatsappEnabled);
    if (smsEnabled !== undefined) contactFields.smsEnabled = Boolean(smsEnabled);
    if (emailEnabled !== undefined) contactFields.emailEnabled = Boolean(emailEnabled);

    try {
        let contact = await Contact.findById(req.params.id);

        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        // Make sure user owns contact
        if (contact.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { $set: contactFields },
            { new: true }
        );

        res.json(contact);
    } catch (err) {
        console.error('Update contact error:', err.message);
        res.status(500).json({ msg: 'Server Error updating contact' });
    }
});

// Toggle WhatsApp alerts status for a contact
router.put('/:id/toggle-whatsapp', authMiddleware, async (req, res) => {
    try {
        let contact = await Contact.findById(req.params.id);

        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        if (contact.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        contact.whatsappEnabled = !contact.whatsappEnabled;
        await contact.save();

        res.json({
            msg: `WhatsApp alerts ${contact.whatsappEnabled ? 'enabled' : 'disabled'} for ${contact.name}`,
            contact
        });
    } catch (err) {
        console.error('Toggle WhatsApp error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Toggle SMS alerts status for a contact
router.put('/:id/toggle-sms', authMiddleware, async (req, res) => {
    try {
        let contact = await Contact.findById(req.params.id);

        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        if (contact.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        contact.smsEnabled = contact.smsEnabled === false ? true : false;
        await contact.save();

        res.json({
            msg: `SMS alerts ${contact.smsEnabled ? 'enabled' : 'disabled'} for ${contact.name}`,
            contact
        });
    } catch (err) {
        console.error('Toggle SMS error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Toggle Email alerts status for a contact
router.put('/:id/toggle-email', authMiddleware, async (req, res) => {
    try {
        let contact = await Contact.findById(req.params.id);

        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        if (contact.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        contact.emailEnabled = contact.emailEnabled === false ? true : false;
        await contact.save();

        res.json({
            msg: `Email alerts ${contact.emailEnabled ? 'enabled' : 'disabled'} for ${contact.name}`,
            contact
        });
    } catch (err) {
        console.error('Toggle Email error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

/**
 * Send SMS directly to a PARTICULAR contact
 * Route: POST /api/contacts/:id/send-sms
 */
router.post('/:id/send-sms', authMiddleware, async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        if (!contact) {
            return res.status(404).json({ msg: 'Emergency contact not found' });
        }

        if (contact.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized to send SMS for this contact' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User profile not found' });
        }

        const { message, latitude, longitude } = req.body;
        let locationUrl = null;
        if (latitude && longitude) {
            locationUrl = `https://www.google.com/maps/place/${latitude},${longitude}`;
        }

        console.log(`\n===============================================================`);
        console.log(`📱 [MANUAL SMS DISPATCH] Sending to Contact: ${contact.name} (${contact.phone})`);
        console.log(`===============================================================\n`);

        const result = await sendDirectContactSMS(contact, user, message, locationUrl);

        if (result.success) {
            contact.lastSmsSentAt = new Date();
            contact.lastSmsStatus = result.status || 'submitted';
            await contact.save();

            return res.json({
                msg: `SMS dispatched to ${contact.name} (${result.to}): Message accepted by ${result.provider}.`,
                contact,
                result
            });
        } else {
            return res.status(400).json({
                msg: `Failed to send SMS to ${contact.name}: ${result.error}`,
                contact,
                result
            });
        }
    } catch (err) {
        console.error('Send direct contact SMS error:', err);
        res.status(500).json({ msg: 'Server error sending SMS to contact: ' + err.message });
    }
});

// Delete contact
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        let contact = await Contact.findById(req.params.id);

        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        if (contact.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Contact.findByIdAndDelete(req.params.id);

        res.json({ msg: 'Contact removed' });
    } catch (err) {
        console.error('Delete contact error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

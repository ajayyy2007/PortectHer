const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { authMiddleware } = require('./auth');
const Contact = require('../models/Contact');
const User = require('../models/User');

router.post('/', authMiddleware, async (req, res) => {
    try {
        const { latitude, longitude, evidence } = req.body;
        
        // Find user and contacts
        const user = await User.findById(req.user.id);
        const contacts = await Contact.find({ user: req.user.id });
        
        if (!contacts || contacts.length === 0) {
            return res.status(400).json({ msg: 'No emergency contacts found' });
        }

        const mapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
        const googleMapLink = `https://www.google.com/maps/place/${latitude},${longitude}`;

        // Create or update Community Alert
        try {
            const Alert = require('../models/Alert');
            await Alert.findOneAndUpdate(
                { user: req.user.id, active: true },
                { latitude, longitude, active: true, createdAt: Date.now(), ...(evidence && { evidence }) },
                { upsert: true, new: true }
            );
        } catch(alertErr) {
            console.error('Failed to create/update alert:', alertErr);
        }

        // Check if email credentials exist AND are not the placeholder values
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_USER !== 'your_email@gmail.com') {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            // Send email to all contacts
            const emailPromises = contacts.filter(c => c.email).map(contact => {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: contact.email,
                    subject: `URGENT: SOS Alert from ${user.name}`,
                    text: `URGENT! ${user.name} has triggered an SOS alert.\n\n` +
                          `They are currently at this location:\n` +
                          `Latitude: ${latitude}\n` +
                          `Longitude: ${longitude}\n\n` +
                          `View on OpenStreetMap: ${mapLink}\n` +
                          `View on Google Maps: ${googleMapLink}\n\n` +
                          `Please reach out to them immediately or seek help.`
                };
                
                if (evidence && evidence.includes('base64,')) {
                    mailOptions.attachments = [{
                        filename: 'sos_evidence.jpg',
                        content: evidence.split('base64,')[1],
                        encoding: 'base64'
                    }];
                }
                
                return transporter.sendMail(mailOptions);
            });

            // Use allSettled so if one email fails, it doesn't crash the entire request
            const results = await Promise.allSettled(emailPromises);
            const failedEmails = results.filter(r => r.status === 'rejected');
            
            if (failedEmails.length > 0) {
                console.error('Some or all emails failed to send:', failedEmails[0].reason);
                return res.status(500).json({ msg: 'SOS triggered but email failed to send. Check your Gmail App Password!' });
            }
            
            console.log('SOS Emails processed for', contacts.length, 'contacts.');
            let smsSuccessCount = 0;

            // Optional SMS integration via Twilio
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
                try {
                    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    const smsPromises = contacts.filter(c => c.phone).map(contact => {
                        return client.messages.create({
                            body: `URGENT! ${user.name} triggered an SOS alert.\nLoc: ${googleMapLink}`,
                            from: process.env.TWILIO_PHONE_NUMBER,
                            to: contact.phone
                        });
                    });
                    
                    const smsResults = await Promise.allSettled(smsPromises);
                    smsSuccessCount = smsResults.filter(r => r.status === 'fulfilled').length;
                    const failedSms = smsResults.filter(r => r.status === 'rejected');
                    
                    if (failedSms.length > 0) {
                        const errReason = failedSms[0].reason?.message || "Unknown Twilio Error";
                        console.error('Some SMS failed:', errReason);
                        res.json({ msg: `SOS Alert triggered! Emails sent. SMS Failed: ${errReason}` });
                        return;
                    }
                    console.log(`SOS SMS sent to ${smsSuccessCount} contacts.`);
                } catch (smsErr) {
                    console.error('Twilio Error:', smsErr);
                    res.json({ msg: `SOS Alert triggered! Emails sent. SMS Failed: ${smsErr.message}` });
                    return;
                }
            } else {
                console.log('Twilio credentials not found; skipping SMS.');
                res.json({ msg: `SOS Alert triggered! Emails sent. (Twilio not configured for SMS)` });
                return;
            }

            res.json({ msg: `SOS Alert triggered successfully! Emails sent. SMS sent to ${smsSuccessCount} contacts.` });
        } else {
            console.log('\n--- simulated SOS Alert ---');
            console.log(`SOS for User: ${user.name}`);
            console.log(`Location: ${latitude}, ${longitude}`);
            console.warn('NOTE: Emails/SMS were NOT sent because EMAIL_USER is either missing or still set to the placeholder in .env!\n');
            res.status(400).json({ msg: 'Email not configured. Please update your .env file with your real email and app password.' });
        }
    } catch (err) {
        console.error('SOS Logic Error:', err);
        res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

module.exports = router;

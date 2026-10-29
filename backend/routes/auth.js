const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Alert = require('../models/Alert');
const OTPVerification = require('../models/OTPVerification');
const { sendOTPWhatsApp, formatRecipientPhone } = require('../services/whatsappService');
const { sendOTPEmail, isValidEmail } = require('../services/emailService');

const router = express.Router();

// Helper to hash OTP with SHA-256 for secure storage
const hashOTP = (otp) => {
    return crypto.createHash('sha256').update(otp.toString().trim()).digest('hex');
};

// Helper for E.164 phone formatting
const formatPhoneKey = (phone, countryCode = '+91') => {
    if (!phone) return '';
    let digits = phone.toString().replace(/\D/g, '');
    if (digits.length === 10) {
        const cc = countryCode.replace(/\D/g, '') || '91';
        digits = cc + digits;
    }
    return '+' + digits;
};

// Auth middleware for token verification
const authMiddleware = (req, res, next) => {
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ msg: 'No token provided, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is invalid or expired' });
    }
};

/**
 * 1. SEND OTP ROUTE
 * Sends OTP via WhatsApp or Email and stores hashed OTP in MongoDB
 */
router.post('/send-otp', async (req, res) => {
    try {
        const { phone, countryCode = '+91', email } = req.body;

        if (!phone || phone.trim() === '') {
            return res.status(400).json({ msg: 'Please enter a valid mobile phone number' });
        }

        const formattedPhone = formatPhoneKey(phone, countryCode);

        // Check if user account with this phone already exists
        const existingUser = await User.findOne({
            $or: [
                { phone: phone.trim() },
                { phone: formattedPhone },
                { phone: formattedPhone.replace('+', '') }
            ]
        });

        if (existingUser) {
            return res.status(400).json({ msg: 'An account with this mobile number already exists. Please login instead.' });
        }

        // Check resend cooldown (60 seconds)
        const recentOTP = await OTPVerification.findOne({ phone: formattedPhone });
        if (recentOTP && recentOTP.resendCooldown && recentOTP.resendCooldown > Date.now()) {
            const secondsLeft = Math.ceil((recentOTP.resendCooldown - Date.now()) / 1000);
            return res.status(429).json({
                msg: `Please wait ${secondsLeft} seconds before requesting a new OTP.`
            });
        }

        // Generate 6-digit secure numeric OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration
        const resendCooldown = new Date(Date.now() + 60 * 1000); // 60 seconds resend cooldown

        // Save / Upsert hashed OTP in MongoDB
        await OTPVerification.findOneAndUpdate(
            { phone: formattedPhone },
            {
                phone: formattedPhone,
                countryCode,
                otpHash,
                expiresAt,
                attempts: 0,
                resendCooldown,
                isVerified: false,
                createdAt: Date.now()
            },
            { upsert: true, new: true }
        );

        const mode = (process.env.WHATSAPP_MODE || 'development').toLowerCase().trim();

        // Send OTP via WhatsApp Cloud API service
        const waResult = await sendOTPWhatsApp(formattedPhone, otp);

        // If email was also supplied and is valid, send OTP to email as a dual-channel option
        let emailSent = false;
        if (email && isValidEmail(email)) {
            const mailRes = await sendOTPEmail(email, otp);
            if (mailRes.success) {
                emailSent = true;
            }
        }

        // In production mode, check if WhatsApp dispatch was actually successful
        if (mode === 'production' && !waResult.success) {
            // If WhatsApp failed but email succeeded, notify user
            if (emailSent) {
                return res.json({
                    msg: `WhatsApp OTP failed (${waResult.error}), but OTP was sent to your email (${email})!`,
                    phone: formattedPhone,
                    emailSent: true,
                    mode
                });
            }

            // Real failure - do not mask with false success
            return res.status(400).json({
                msg: `Failed to deliver OTP: ${waResult.error || 'WhatsApp provider error'}.`,
                mode,
                error: waResult.error
            });
        }

        // Development mode or successful production delivery
        const isSimulated = waResult.simulated || mode === 'development';
        const msg = isSimulated
            ? `WhatsApp OTP simulated in development mode for ${formattedPhone}.`
            : `OTP sent successfully to ${formattedPhone} via WhatsApp!`;

        return res.json({
            msg,
            phone: formattedPhone,
            mode,
            simulated: isSimulated,
            emailSent,
            ...(isSimulated && { devOtp: otp, note: 'Development Mode: OTP included for automated testing.' })
        });
    } catch (err) {
        console.error('Send OTP error:', err.message);
        return res.status(500).json({ msg: 'Failed to dispatch OTP. Please try again.' });
    }
});

/**
 * 2. VERIFY OTP ROUTE
 * Validates hashed OTP against MongoDB record
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, countryCode = '+91', otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ msg: 'Phone number and OTP code are required.' });
        }

        const formattedPhone = formatPhoneKey(phone, countryCode);
        const record = await OTPVerification.findOne({ phone: formattedPhone });

        if (!record) {
            return res.status(400).json({ msg: 'No active OTP request found for this mobile number. Please request a new OTP.' });
        }

        if (record.expiresAt < Date.now()) {
            await OTPVerification.deleteOne({ _id: record._id });
            return res.status(400).json({ msg: 'OTP has expired. Please request a new OTP.' });
        }

        if (record.attempts >= 5) {
            await OTPVerification.deleteOne({ _id: record._id });
            return res.status(400).json({ msg: 'Maximum verification attempts exceeded. Please request a new OTP.' });
        }

        const submittedHash = hashOTP(otp);
        if (submittedHash !== record.otpHash) {
            record.attempts += 1;
            await record.save();
            const remainingAttempts = 5 - record.attempts;
            return res.status(400).json({ msg: `Incorrect OTP code. ${remainingAttempts} attempt(s) remaining.` });
        }

        // Mark OTP as verified
        record.isVerified = true;
        await record.save();

        return res.json({
            msg: 'Mobile number verified successfully!',
            phone: formattedPhone,
            verified: true
        });
    } catch (err) {
        console.error('Verify OTP error:', err.message);
        return res.status(500).json({ msg: 'Server error during OTP verification.' });
    }
});

/**
 * 3. REGISTER ROUTE
 * Direct user registration with name, email, mobile phone, and password (No OTP required)
 */
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, countryCode = '+91' } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ msg: 'Please provide your full name.' });
        }

        if (!email || !email.trim()) {
            return res.status(400).json({ msg: 'Please provide an email address.' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ msg: 'Please provide a valid email address.' });
        }

        if (!phone || !phone.toString().trim()) {
            return res.status(400).json({ msg: 'Please provide a mobile phone number.' });
        }

        const phoneDigits = phone.toString().replace(/\D/g, '');
        if (phoneDigits.length < 7 || phoneDigits.length > 15) {
            return res.status(400).json({ msg: 'Please enter a valid mobile number (7 to 15 digits).' });
        }

        if (!password || typeof password !== 'string') {
            return res.status(400).json({ msg: 'Password is required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ msg: 'Password must be at least 6 characters long.' });
        }

        const formattedPhone = formatPhoneKey(phone, countryCode);

        // Check if user email already exists
        let user = await User.findOne({ email: email.toLowerCase().trim() });
        if (user) {
            return res.status(400).json({ msg: 'An account with this email address already exists. Please login instead.' });
        }

        // Check if user mobile number already exists
        let existingPhoneUser = await User.findOne({
            $or: [
                { phone: phone.toString().trim() },
                { phone: formattedPhone },
                { phone: formattedPhone.replace('+', '') }
            ]
        });
        if (existingPhoneUser) {
            return res.status(400).json({ msg: 'An account with this mobile phone number already exists. Please login instead.' });
        }

        // Create new User instance
        user = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: password,
            phone: formattedPhone,
            countryCode,
            mobileVerified: true,
            mobileVerifiedAt: Date.now()
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Generate JWT Token
        const payload = {
            user: {
                id: user.id
            }
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secret123',
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                countryCode: user.countryCode,
                mobileVerified: user.mobileVerified
            }
        });
    } catch (err) {
        console.error('Registration error:', err.message);
        res.status(500).json({ msg: 'Server Error during registration' });
    }
});

/**
 * 4. LOGIN ROUTE
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Please provide email and password' });
    }

    try {
        let user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(400).json({ msg: 'No account found with this email address.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Incorrect password. Please try again.' });
        }

        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secret123',
            { expiresIn: '7d' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        countryCode: user.countryCode,
                        mobileVerified: user.mobileVerified
                    }
                });
            }
        );
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ msg: 'Server Error during login' });
    }
});

/**
 * 5. GET LOGGED-IN USER ROUTE
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error('Get user error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

/**
 * 6. DELETE USER ACCOUNT ROUTE
 */
router.delete('/account', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        await Contact.deleteMany({ user: userId });
        await Alert.deleteMany({ user: userId });
        await User.findByIdAndDelete(userId);

        res.json({ msg: 'User account and all associated emergency contacts and alerts deleted successfully.' });
    } catch (err) {
        console.error('Delete account error:', err.message);
        res.status(500).json({ msg: 'Server error deleting account.' });
    }
});

module.exports = {
    router,
    authMiddleware
};

const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        index: true
    },
    countryCode: {
        type: String,
        default: '+91'
    },
    otpHash: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 300 // MongoDB automatic TTL deletion after 5 minutes
    },
    attempts: {
        type: Number,
        default: 0
    },
    resendCooldown: {
        type: Date
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('OTPVerification', otpVerificationSchema);

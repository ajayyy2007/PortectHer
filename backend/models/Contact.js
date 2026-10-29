const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    countryCode: {
        type: String,
        default: '+91',
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    relation: {
        type: String,
        default: 'Emergency Contact'
    },
    whatsappEnabled: {
        type: Boolean,
        default: true
    },
    smsEnabled: {
        type: Boolean,
        default: true
    },
    emailEnabled: {
        type: Boolean,
        default: true
    },
    lastSmsSentAt: {
        type: Date
    },
    lastSmsStatus: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Contact', contactSchema);

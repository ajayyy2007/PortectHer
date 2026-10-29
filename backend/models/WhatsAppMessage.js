const mongoose = require('mongoose');

const whatsAppMessageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    emergencyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Alert'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    },
    recipientNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'submitted', 'sent', 'delivered', 'read', 'failed', 'simulated', 'not_configured'],
        default: 'pending'
    },
    failureReason: {
        type: String
    },
    sentAt: {
        type: Date,
        default: Date.now
    },
    deliveredAt: {
        type: Date
    },
    readAt: {
        type: Date
    }
});

module.exports = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);

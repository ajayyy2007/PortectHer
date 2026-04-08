const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    },
    evidence: {
        type: String, // Base64 image
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '24h' // Automatically remove alerts after 24 hours
    }
});

module.exports = mongoose.model('Alert', AlertSchema);

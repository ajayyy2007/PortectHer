const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    emergencyId: {
        type: String,
        default: null
    },
    // Coordinates are optional so GPS failures do not crash the emergency dispatch
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },
    locationAccuracy: {
        type: Number,
        default: null
    },
    locationStatus: {
        type: String,
        enum: ['acquired', 'unavailable', 'last_known'],
        default: 'acquired'
    },
    locationTimestamp: {
        type: Date,
        default: Date.now
    },
    googleMapsUrl: {
        type: String,
        default: null
    },
    liveTrackingUrl: {
        type: String,
        default: null
    },
    photoEvidenceUrl: {
        type: String,
        default: null
    },
    photoMimeType: {
        type: String,
        default: 'image/jpeg'
    },
    audioEvidenceUrl: {
        type: String,
        default: null
    },
    audioMimeType: {
        type: String,
        default: 'audio/webm'
    },
    audioDurationSeconds: {
        type: Number,
        default: 5
    },
    active: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'RESOLVED', 'CANCELLED'],
        default: 'ACTIVE'
    },
    liveTrackingSessionId: {
        type: String,
        default: null
    },
    trackingUpdates: [{
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    evidence: {
        type: String, // Base64 image
        default: null
    },
    audio: {
        type: String, // Base64 audio
        default: null
    },
    evidenceFile: {
        type: String, // File system path/reference
        default: null
    },
    audioFile: {
        type: String, // File system path/reference
        default: null
    },
    evidenceMetadata: {
        photoCaptured: { type: Boolean, default: false },
        photoUploadedAt: { type: Date, default: null },
        audioRecorded: { type: Boolean, default: false },
        audioUploadedAt: { type: Date, default: null },
        audioDurationSeconds: { type: Number, default: 5 }
    },
    notificationResults: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '48h' // Automatically expire historical alerts after 48h
    },
    endedAt: {
        type: Date,
        default: null
    }
});

module.exports = mongoose.model('Alert', AlertSchema);

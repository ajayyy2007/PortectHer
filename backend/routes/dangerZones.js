const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./auth');
const DangerZone = require('../models/DangerZone');

// Get all danger zones
router.get('/', async (req, res) => {
    try {
        const zones = await DangerZone.find().sort({ createdAt: -1 }).limit(100);
        res.json(zones);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Add a danger zone
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { latitude, longitude, description } = req.body;
        
        let newZone = new DangerZone({
            latitude,
            longitude,
            description,
            reportedBy: req.user.id
        });
        
        await newZone.save();
        res.json(newZone);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

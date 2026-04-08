const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./auth');
const Alert = require('../models/Alert');

// Get all active alerts
router.get('/', async (req, res) => {
    try {
        // Fetch only active ones (e.g. for community map view)
        const activeAlerts = await Alert.find({ active: true })
                                        .populate('user', 'name')
                                        .sort({ createdAt: -1 })
                                        .limit(50);
        res.json(activeAlerts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Cancel/Resolve User's active alert
router.post('/resolve', authMiddleware, async (req, res) => {
    try {
        await Alert.updateMany(
            { user: req.user.id, active: true },
            { active: false }
        );
        res.json({ msg: 'Alerts resolved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Post Evidence to Active Alert
router.post('/evidence', authMiddleware, async (req, res) => {
    try {
        const { evidenceData } = req.body;
        // Update the most recent active alert for this user
        const alert = await Alert.findOneAndUpdate(
            { user: req.user.id, active: true },
            { evidence: evidenceData },
            { sort: { createdAt: -1 }, new: true }
        );
        if(!alert) return res.status(404).json({ msg: 'No active alert found' });
        res.json({ msg: 'Evidence added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

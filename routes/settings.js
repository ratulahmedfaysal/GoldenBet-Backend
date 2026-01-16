const router = require('express').Router();
const SiteSettings = require('../models/SiteSettings');
const auth = require('../middleware/auth');

// Get Settings (Public)
router.get('/', async (req, res) => {
    try {
        let settings = await SiteSettings.findOne({ key: 'main_settings' });
        if (!settings) {
            settings = await new SiteSettings({ key: 'main_settings' }).save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Settings (Admin Only)
router.put('/', auth, async (req, res) => {
    try {
        if (req.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        const settings = await SiteSettings.findOneAndUpdate({}, req.body, { new: true, upsert: true });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

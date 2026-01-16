const router = require('express').Router();
const ReferralSetting = require('../models/ReferralSetting');
const UserReferral = require('../models/UserReferral');
const auth = require('../middleware/auth');

// Get Settings (All rows) - Public
router.get('/', async (req, res) => {
    try {
        const settings = await ReferralSetting.find({ is_active: true }).sort({ level_number: 1 });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Settings (Admin)
router.get('/admin', auth, async (req, res) => {
    try {
        if (req.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
        const settings = await ReferralSetting.find().sort({ level_number: 1 });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update or Create Setting (One row)
router.post('/', auth, async (req, res) => {
    try {
        if (req.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

        const setting = new ReferralSetting(req.body);
        await setting.save();
        res.json(setting);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        if (req.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

        const setting = await ReferralSetting.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(setting);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get Ref List (Admin)
router.get('/list', auth, async (req, res) => {
    try {
        if (req.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

        const referrals = await UserReferral.find()
            .populate('referrer_id', 'email username')
            .populate('referred_user_id', 'email username')
            .sort({ created_at: -1 });
        res.json(referrals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get My Referrals (User)
router.get('/my-referrals', auth, async (req, res) => {
    try {
        const referrals = await UserReferral.find({ referrer_id: req.user })
            .populate('referred_user_id', 'email username is_active created_at')
            .sort({ created_at: -1 });

        const formattedReferrals = referrals.map(ref => ({
            ...ref.toObject(),
            referred_user: ref.referred_user_id
        }));

        res.json(formattedReferrals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

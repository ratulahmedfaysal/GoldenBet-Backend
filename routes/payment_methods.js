const router = require('express').Router();
const PaymentMethod = require('../models/PaymentMethod');
const CoinPaymentsSettings = require('../models/CoinPaymentsSettings');
const auth = require('../middleware/auth');

// Middleware to check if admin
const isAdmin = (req, res, next) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

// Get All (Public/Auth - Returns active for users, all for admin)
router.get('/', auth, async (req, res) => {
    try {
        let query = {};
        if (req.role !== 'admin') {
            query.is_active = true;
        }

        const methods = await PaymentMethod.find(query).sort({ created_at: -1 });
        res.json(methods);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create
router.post('/', auth, isAdmin, async (req, res) => {
    try {
        const method = new PaymentMethod(req.body);
        await method.save();
        res.json(method);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update
router.put('/:id', auth, isAdmin, async (req, res) => {
    try {
        const method = await PaymentMethod.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(method);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete
router.delete('/:id', auth, isAdmin, async (req, res) => {
    try {
        await PaymentMethod.findByIdAndDelete(req.params.id);
        res.json({ message: 'Payment method deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CoinPayments Settings Routes ---

// Get Settings
router.get('/settings/coinpayments', auth, isAdmin, async (req, res) => {
    try {
        const settings = await CoinPaymentsSettings.findOne();
        res.json(settings || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update/Create Settings
router.post('/settings/coinpayments', auth, isAdmin, async (req, res) => {
    try {
        let settings = await CoinPaymentsSettings.findOne();
        if (settings) {
            settings = await CoinPaymentsSettings.findByIdAndUpdate(settings._id, req.body, { new: true });
        } else {
            settings = new CoinPaymentsSettings(req.body);
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;

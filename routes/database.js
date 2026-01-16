const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');

// Import all models
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const Transaction = require('../models/Transaction');
const PaymentMethod = require('../models/PaymentMethod');
const CoinPaymentsSettings = require('../models/CoinPaymentsSettings');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const ReferralSetting = require('../models/ReferralSetting');
const UserReferral = require('../models/UserReferral');

const MODELS = {
    users: User,
    site_settings: SiteSettings,
    transactions: Transaction,
    payment_methods: PaymentMethod,
    coinpayments_settings: CoinPaymentsSettings,
    deposits: Deposit,
    withdrawals: Withdrawal,
    referral_settings: ReferralSetting,
    user_referrals: UserReferral
};

// Middleware to check if admin
const isAdmin = (req, res, next) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

// Backup - Download JSON
router.get('/backup', auth, isAdmin, async (req, res) => {
    try {
        const backup = {};
        for (const [key, Model] of Object.entries(MODELS)) {
            backup[key] = await Model.find({});
        }
        res.json(backup);
    } catch (err) {
        console.error('Backup error:', err);
        res.status(500).json({ error: 'Backup failed' });
    }
});

// Restore - Upload JSON
router.post('/restore', auth, isAdmin, async (req, res) => {
    try {
        const data = req.body;
        const { clean } = req.query;

        if (!data) return res.status(400).json({ error: 'No data provided' });

        for (const [key, Model] of Object.entries(MODELS)) {
            if (data[key] && Array.isArray(data[key])) {
                if (clean === 'true') {
                    await Model.deleteMany({});
                }

                for (const item of data[key]) {
                    if (item._id) {
                        try {
                            await Model.findByIdAndUpdate(item._id, item, { upsert: true });
                        } catch (e) {
                            // If findByIdAndUpdate fails (e.g. invalid cast), try create
                            await Model.create(item);
                        }
                    } else {
                        await Model.create(item);
                    }
                }
            }
        }

        res.json({ message: 'Restore completed successfully' });
    } catch (err) {
        console.error('Restore error:', err);
        res.status(500).json({ error: 'Restore failed: ' + err.message });
    }
});

module.exports = router;

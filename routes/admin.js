const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const SiteSettings = require('../models/SiteSettings');
const auth = require('../middleware/auth');

// Middleware to check if admin
const isAdmin = (req, res, next) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

// --- User Management ---

// Get all users
router.get('/users', auth, isAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ created_at: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user
router.put('/users/:id', auth, isAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Adjust User Balance
router.post('/users/:id/adjust-balance', auth, isAdmin, async (req, res) => {
    try {
        const { amount, type, description } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const balanceBefore = user.balance;

        if (type === 'add') {
            user.balance += parseFloat(amount);
        } else if (type === 'deduct') {
            user.balance -= parseFloat(amount);
        }

        await user.save();

        // Create transaction log
        const transaction = new Transaction({
            user_id: user._id,
            type: type === 'add' ? 'deposit' : 'withdrawal',
            amount: parseFloat(amount),
            balance_before: balanceBefore,
            balance_after: user.balance,
            description: description || `Admin ${type} adjustment`,
            status: 'completed'
        });
        await transaction.save();

        res.json({ success: true, user, transaction });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Site Settings ---

// Get Site Settings
router.get('/settings', auth, isAdmin, async (req, res) => {
    try {
        let settings = await SiteSettings.findOne({ key: 'main_settings' });
        if (!settings) {
            settings = new SiteSettings({ key: 'main_settings' });
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Site Settings
router.put('/settings', auth, isAdmin, async (req, res) => {
    try {
        const settings = await SiteSettings.findOneAndUpdate(
            { key: 'main_settings' },
            { $set: req.body },
            { new: true, upsert: true }
        );
        res.json(settings);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Deposit Management ---

// Get all deposits
router.get('/deposits', auth, isAdmin, async (req, res) => {
    try {
        const deposits = await Deposit.find().populate('user_id', 'username email').sort({ created_at: -1 });
        res.json(deposits);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve/Reject Deposit
router.put('/deposits/:id', auth, isAdmin, async (req, res) => {
    try {
        const { status, admin_notes } = req.body;
        const deposit = await Deposit.findById(req.params.id);

        if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
        if (deposit.status !== 'pending') return res.status(400).json({ error: 'Deposit already processed' });

        deposit.status = status;
        deposit.admin_notes = admin_notes;
        await deposit.save();

        if (status === 'approved') {
            const user = await User.findById(deposit.user_id);
            const balanceBefore = user.balance;
            user.balance += deposit.amount;
            user.total_deposit += deposit.amount;
            await user.save();

            // Update Transaction record for the deposit
            await Transaction.findOneAndUpdate(
                { reference_id: deposit._id },
                { status: 'completed', balance_after: user.balance }
            );

            // MLM Referral Commissions
            // For now, keep the simple 5% logic if we don't have MLM logic integrated yet
            // But usually we should use ReferralSetting logic here.
            // I will implement a simpler but dynamic version if time permits, or port the Aurabit one.
            if (user.referred_by) {
                const referrer = await User.findOne({ referral_code: user.referred_by });
                if (referrer) {
                    const commission = deposit.amount * 0.05;
                    const refBalanceBefore = referrer.balance;
                    referrer.balance += commission;
                    await referrer.save();

                    const refTx = new Transaction({
                        user_id: referrer._id,
                        type: 'referral_commission',
                        amount: commission,
                        balance_before: refBalanceBefore,
                        balance_after: referrer.balance,
                        description: `5% Commission from ${user.username}'s deposit`,
                        status: 'completed',
                        reference_id: deposit._id
                    });
                    await refTx.save();
                }
            }
        }

        res.json(deposit);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Withdrawal Management ---

// Get all withdrawals
router.get('/withdrawals', auth, isAdmin, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find().populate('user_id', 'username email').sort({ created_at: -1 });
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve/Reject Withdrawal
router.put('/withdrawals/:id', auth, isAdmin, async (req, res) => {
    try {
        const { status, admin_notes } = req.body;
        const withdrawal = await Withdrawal.findById(req.params.id);

        if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
        if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already processed' });

        withdrawal.status = status;
        withdrawal.admin_notes = admin_notes;
        await withdrawal.save();

        if (status === 'rejected') {
            const user = await User.findById(withdrawal.user_id);
            user.balance += withdrawal.amount; // Refund balance
            await user.save();

            await Transaction.findOneAndUpdate(
                { reference_id: withdrawal._id },
                { status: 'rejected', balance_after: user.balance }
            );
        } else if (status === 'approved') {
            const user = await User.findById(withdrawal.user_id);
            user.total_withdrawal += withdrawal.amount;
            await user.save();

            await Transaction.findOneAndUpdate(
                { reference_id: withdrawal._id },
                { status: 'completed' }
            );
        }

        res.json(withdrawal);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Reset User 2FA
router.post('/users/:id/reset-2fa', auth, isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.two_factor_enabled = false;
        user.two_factor_secret = undefined;
        await user.save();

        res.json({ success: true, message: '2FA reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Admin Password (Self)
router.post('/change-password', auth, isAdmin, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        const user = await User.findById(req.user);

        const isMatch = await bcrypt.compare(current_password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid current password' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(new_password, salt);
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset User Password (Direct Override)
router.post('/users/:id/reset-password', auth, isAdmin, async (req, res) => {
    try {
        const { new_password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(new_password, salt);
        await user.save();

        res.json({ success: true, message: `Password for ${user.username} has been reset` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Stats ---
router.get('/stats', auth, isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'user' });
        const totalDepositsDoc = await Deposit.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const totalWithdrawalsDoc = await Withdrawal.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
        const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });
        const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });
        const totalDepositCommissionsDoc = await Transaction.aggregate([
            { $match: { type: 'referral_commission', status: 'completed' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        res.json({
            totalUsers,
            totalDeposits: totalDepositsDoc[0]?.total || 0,
            totalWithdrawals: totalWithdrawalsDoc[0]?.total || 0,
            pendingDeposits,
            pendingWithdrawals,
            totalDepositCommissions: totalDepositCommissionsDoc[0]?.total || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

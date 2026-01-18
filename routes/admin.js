const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const SiteSettings = require('../models/SiteSettings');
const Notice = require('../models/Notice');
const RedeemCode = require('../models/RedeemCode');
const SpinHistory = require('../models/SpinHistory');
const BonusHistory = require('../models/BonusHistory'); // Optional if strictly using Transaction
const Blog = require('../models/Blog'); // Import Blog model
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

            // MLM Referral Commissions (Recursive Upstream)
            try {
                // Get all deposit levels sorted by level number (1, 2, 3...)
                const mlmLevels = await ReferralSetting.find({ system_type: 'deposit', is_active: true }).sort({ level_number: 1 });

                if (mlmLevels.length > 0) {
                    let currentMember = user; // starting from the depositor
                    let processedLevels = 0;
                    const maxLevels = mlmLevels.length;

                    // Loop through levels (1 to Max)
                    // Level 1 Commission goes to direct referrer (parent)
                    // Level 2 Commission goes to grandparent
                    while (currentMember.referred_by && processedLevels < maxLevels) {
                        const parentUser = await User.findOne({ referral_code: currentMember.referred_by });
                        if (!parentUser) break;

                        // Get setting for this level (index 0 is Level 1, etc.)
                        const levelSetting = mlmLevels[processedLevels];

                        // Calculate Commission
                        // NOTE: levelSetting.level_number should correspond to (processedLevels + 1)
                        // processedLevels = 0 -> We are looking for parent (Level 1 relation) -> Use Level 1 setting
                        if (levelSetting && levelSetting.commission_percentage > 0) {
                            const commissionAmount = deposit.amount * (levelSetting.commission_percentage / 100);

                            // Pay the parent
                            parentUser.balance += commissionAmount;
                            await parentUser.save();

                            // Log Transaction
                            await new Transaction({
                                user_id: parentUser._id,
                                type: 'referral_commission',
                                amount: commissionAmount,
                                balance_before: parentUser.balance - commissionAmount,
                                balance_after: parentUser.balance,
                                description: `${levelSetting.commission_percentage}% Commission from Level ${levelSetting.level_number} referral (${user.username})`, // Show original user name
                                status: 'completed',
                                reference_id: deposit._id
                            }).save();

                            // Update/Create UserReferral record for tracking total earnings between these two
                            // NOTE: This tracks "Total earned from X". 
                            // In MLM, user A might earn from user C (Level 2).
                            await UserReferral.findOneAndUpdate(
                                { referrer_id: parentUser._id, referred_user_id: user._id },
                                { $inc: { commission_earned: commissionAmount } },
                                { upsert: true }
                            );
                        }

                        // Move up the chain
                        currentMember = parentUser;
                        processedLevels++;
                    }
                }
            } catch (err) {
                console.error("MLM Commission Error:", err);
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

        // Enhanced Stats
        const activeRedeemCodes = await RedeemCode.countDocuments({
            $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: { $gt: new Date() } }
            ]
        });
        const totalSpins = await SpinHistory.countDocuments({});

        // Calculate total bonus distributed (using 'bonus' type transactions)
        const totalBonusDoc = await Transaction.aggregate([
            { $match: { type: 'bonus', status: 'completed' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        // Calculate Total Bonuses Available (Balance held by users)
        // const totalBonusAvailableDoc = await User.aggregate([
        //     { $group: { _id: null, total: { $sum: "$bonus_balance" } } }
        // ]);

        // Count Active Bonuses from Site Settings (Content Management)
        const settings = await SiteSettings.findOne();
        const activeBonusesCount = settings?.general?.bonuses?.filter(b => b.isActive !== false).length || 0;

        // Count Active Promotions
        const activePromotions = await Blog.countDocuments({ type: 'promotion', status: 'published' });

        res.json({
            totalUsers,
            totalDeposits: totalDepositsDoc[0]?.total || 0,
            totalWithdrawals: totalWithdrawalsDoc[0]?.total || 0,
            pendingDeposits,
            pendingWithdrawals,
            totalDepositCommissions: totalDepositCommissionsDoc[0]?.total || 0,
            activeRedeemCodes,
            totalSpins,
            totalBonusGiven: totalBonusDoc[0]?.total || 0,
            totalBonusAvailable: activeBonusesCount, // Now returns count of active bonuses
            activePromotions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Notices ---
// --- Notices ---
router.post('/notices', auth, isAdmin, async (req, res) => {
    try {
        const { recipient, subject, message, image, type } = req.body;
        // If type is 'global' (Send to Everyone), recipient should be null
        const noticeType = type === 'individual' ? 'personal' : (type || 'personal'); // normalize 'individual' to 'personal' just in case

        if (noticeType === 'global') {
            const notice = new Notice({
                recipient: null,
                type: 'global',
                subject,
                message,
                image
            });
            await notice.save();
            console.log("Created Global Notice:", notice._id);
            res.json(notice);
        } else {
            // Personal - Recipient can be single ID or Array of IDs
            if (Array.isArray(recipient)) {
                console.log("Creating Personal Notices for:", recipient);
                const notices = await Promise.all(recipient.map(uid =>
                    new Notice({
                        recipient: uid,
                        type: 'personal',
                        subject,
                        message,
                        image
                    }).save()
                ));
                console.log("Created", notices.length, "notices");
                res.json({ success: true, count: notices.length });
            } else {
                console.log("Creating Single Personal Notice for:", recipient);
                // Single
                const notice = new Notice({
                    recipient: recipient,
                    type: 'personal',
                    subject,
                    message,
                    image
                });
                await notice.save();
                console.log("Created Notice:", notice._id);
                res.json(notice);
            }
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Redeem Codes ---
router.get('/redeem-codes', auth, isAdmin, async (req, res) => {
    try {
        const codes = await RedeemCode.find().sort({ createdAt: -1 });
        res.json(codes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/redeem-codes', auth, isAdmin, async (req, res) => {
    try {
        const { code, rewardAmount, maxClaims, allowedUsers, expiresAt } = req.body;
        const newCode = new RedeemCode({
            code,
            rewardAmount,
            maxClaims,
            allowedUsers: allowedUsers || [],
            expiresAt: expiresAt || null
        });
        await newCode.save();
        res.json(newCode);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/redeem-codes/:id', auth, isAdmin, async (req, res) => {
    try {
        const { code, rewardAmount, maxClaims, allowedUsers, expiresAt } = req.body;

        const updatedCode = await RedeemCode.findByIdAndUpdate(
            req.params.id,
            {
                code,
                rewardAmount,
                maxClaims,
                allowedUsers: allowedUsers || [],
                expiresAt: expiresAt || null
            },
            { new: true, runValidators: true }
        );

        if (!updatedCode) return res.status(404).json({ error: 'Code not found' });

        res.json(updatedCode);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;

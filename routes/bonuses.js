const express = require('express');
const router = express.Router();
const User = require('../models/User');
const BonusHistory = require('../models/BonusHistory');
const Transaction = require('../models/Transaction');
const SiteSettings = require('../models/SiteSettings');
const auth = require('../middleware/auth');

// Helper to check eligibility
async function checkEligibility(user, bonus) {
    if (!bonus || !bonus.isActive) return { eligible: false, reason: 'Bonus inactive' };

    // Check Expiry
    if (bonus.expiryDate && new Date() > new Date(bonus.expiryDate)) {
        return { eligible: false, reason: 'Bonus expired' };
    }

    // Check if already claimed
    const claimed = await BonusHistory.findOne({ userId: user._id, bonusId: bonus.id });
    if (claimed) return { eligible: false, reason: 'Already claimed', claimedAt: claimed.claimedAt };

    let criteriaResults = [];
    let allCriteriaMet = true;
    let failReason = null;

    // New Multi-Criteria Check
    if (bonus.criteria && bonus.criteria.length > 0) {
        for (const criterion of bonus.criteria) {
            let met = false;
            let current = 0;
            let required = criterion.value;
            let label = '';

            // 1. Minimum Deposit (Total or Date Range)
            if (criterion.type === 'min_deposit' || criterion.type === 'deposit_date_range') {
                label = `Min Deposit: ${required}`;
                if (criterion.startDate || criterion.endDate) {
                    const start = criterion.startDate ? new Date(criterion.startDate).toLocaleDateString() : 'Start';
                    const end = criterion.endDate ? new Date(criterion.endDate).toLocaleDateString() : 'End';
                    label += ` (${start} - ${end})`;
                }

                // 1. Get all used transaction IDs for this user
                const usedBonuses = await BonusHistory.find({ userId: user._id }).select('used_transaction_ids');
                const usedTransactionIds = usedBonuses.reduce((acc, curr) => {
                    return acc.concat(curr.used_transaction_ids || []);
                }, []).map(id => id.toString());

                // 2. Build Query for Available Deposits
                const query = {
                    user_id: user._id,
                    type: 'deposit',
                    status: { $in: ['completed', 'approved'] },
                    _id: { $nin: usedTransactionIds }
                };

                if (criterion.startDate) query.created_at = { ...query.created_at, $gte: new Date(criterion.startDate) };
                if (criterion.endDate) {
                    try {
                        query.created_at = query.created_at || {};
                        const endDate = new Date(criterion.endDate);
                        // Validate Date
                        if (!isNaN(endDate.getTime())) {
                            endDate.setHours(23, 59, 59, 999);
                            query.created_at.$lte = endDate;
                        } else {
                            console.error('Invalid End Date for bonus:', bonus.id, criterion.endDate);
                        }
                    } catch (e) {
                        console.error('Date parsing error:', e);
                    }
                }

                const deposits = await Transaction.find(query);
                const availableDeposit = deposits.reduce((sum, tx) => sum + tx.amount, 0);

                current = availableDeposit;
                if (availableDeposit >= criterion.value) met = true;
            }

            // 2. Referrals (Total Valid or Date Range)
            else if (criterion.type === 'valid_referrals' || criterion.type === 'referrals_date_range') {
                label = `Valid Referrals: ${required}`;
                if (criterion.startDate || criterion.endDate) {
                    const start = criterion.startDate ? new Date(criterion.startDate).toLocaleDateString() : 'Start';
                    const end = criterion.endDate ? new Date(criterion.endDate).toLocaleDateString() : 'End';
                    label += ` (${start} - ${end})`;
                }

                const query = { referred_by: user.referral_code, total_deposit: { $gt: 0 } };

                if (criterion.startDate) query.created_at = { ...query.created_at, $gte: new Date(criterion.startDate) };
                if (criterion.endDate) {
                    try {
                        query.created_at = query.created_at || {};
                        const endDate = new Date(criterion.endDate);
                        if (!isNaN(endDate.getTime())) {
                            endDate.setHours(23, 59, 59, 999);
                            query.created_at.$lte = endDate;
                        }
                    } catch (e) { console.error('Date parsing error', e); }
                }

                const referralCount = await User.countDocuments(query);
                current = referralCount;
                if (referralCount >= criterion.value) met = true;
            }

            criteriaResults.push({
                type: criterion.type,
                label,
                required,
                current,
                met
            });

            if (!met) {
                allCriteriaMet = false;
                if (!failReason) failReason = `Requirement not met: ${label}`;
            }
        }
    } else if (bonus.criteriaType === 'min_deposit') {
        // Legacy support
        const met = user.total_deposit >= bonus.criteriaAmount;
        criteriaResults.push({
            type: 'min_deposit',
            label: `Min Deposit: ${bonus.criteriaAmount}`,
            required: bonus.criteriaAmount,
            current: user.total_deposit,
            met
        });
        if (!met) {
            allCriteriaMet = false;
            failReason = 'Insufficient deposit';
        }
    }

    return {
        eligible: allCriteriaMet,
        reason: failReason,
        criteriaResults
    };
}

// Check status of all bonuses for a user
router.get('/status', auth, async (req, res) => {
    try {
        console.log('GET /bonuses/status called for user:', req.user);
        const user = await User.findById(req.user);
        if (!user) {
            console.log('User not found for ID:', req.user);
            return res.status(404).json({ message: 'User not found' });
        }

        const settings = await SiteSettings.findOne({ key: 'main_settings' });
        const bonuses = settings?.general?.bonuses || [];
        console.log(`Checking eligibility for ${bonuses.length} bonuses`);

        const statusMap = {};

        for (const bonus of bonuses) {
            try {
                const eligibility = await checkEligibility(user, bonus);
                statusMap[bonus.id] = eligibility;
            } catch (innerErr) {
                console.error(`Error checking eligibility for bonus ${bonus.id}:`, innerErr);
                statusMap[bonus.id] = { eligible: false, reason: 'Error checking eligibility' };
            }
        }

        console.log('Status map generated. Sending response.');
        res.json(statusMap);
    } catch (err) {
        console.error('Error in /bonuses/status:', err);
        res.status(500).json({ message: 'Server error: ' + err.message });
    }
});

// Claim a bonus
router.post('/claim/:id', auth, async (req, res) => {
    try {
        const bonusId = parseInt(req.params.id);
        const user = await User.findById(req.user);
        const settings = await SiteSettings.findOne({ key: 'main_settings' });
        const bonuses = settings?.general?.bonuses || [];
        const bonus = bonuses.find(b => b.id == bonusId);

        if (!bonus) return res.status(404).json({ message: 'Bonus not found' });

        const eligibility = await checkEligibility(user, bonus);
        if (!eligibility.eligible) {
            return res.status(400).json({ message: eligibility.reason });
        }

        // 1. Get all previously used transaction IDs
        const usedBonuses = await BonusHistory.find({ userId: user._id }).select('used_transaction_ids');
        const usedTransactionIds = usedBonuses.reduce((acc, curr) => {
            return acc.concat(curr.used_transaction_ids || []);
        }, []).map(id => id.toString());

        // 2. Find qualifying deposits for THIS claim (that are not used)
        const depositCriterion = bonus.criteria?.find(c => c.type === 'min_deposit' || c.type === 'deposit_date_range');
        let qualifyingTransactions = [];
        let qualifyingAmount = 0;

        // Even if no specific criteria (legacy), we should try to mark 'recent' or 'all' available deposits as used? 
        // For safety, only consume if there IS a deposit criteria. If it's a "free" bonus, consume nothing.
        if (depositCriterion) {
            const query = {
                user_id: user._id,
                type: 'deposit',
                status: { $in: ['completed', 'approved'] },
                _id: { $nin: usedTransactionIds }
            };

            if (depositCriterion.startDate) query.created_at = { ...query.created_at, $gte: new Date(depositCriterion.startDate) };
            if (depositCriterion.endDate) {
                try {
                    query.created_at = query.created_at || {};
                    const endDate = new Date(depositCriterion.endDate);
                    if (!isNaN(endDate.getTime())) {
                        endDate.setHours(23, 59, 59, 999);
                        query.created_at.$lte = endDate;
                    }
                } catch (e) { console.error('Date parsing error', e); }
            }
            qualifyingTransactions = await Transaction.find(query);
            qualifyingAmount = qualifyingTransactions.reduce((sum, tx) => sum + tx.amount, 0);

            // Double check eligibility here? checkEligibility() already did, but good for sanity.
            if (qualifyingAmount < depositCriterion.value) {
                return res.status(400).json({ message: 'Insufficient available deposit balance (some deposits may have been used for other bonuses).' });
            }
        }

        // Calculate Reward Amount
        let amount = 0;

        if (bonus.rewardType === 'percentage') {
            amount = (qualifyingAmount * (bonus.rewardAmount / 100));
        } else {
            // Fixed Amount
            if (bonus.rewardAmount > 0) {
                amount = bonus.rewardAmount;
            } else {
                const amountStr = bonus.amount.toString().replace(/[^0-9.]/g, '');
                amount = parseFloat(amountStr);
            }
        }

        if (isNaN(amount) || amount <= 0) return res.status(500).json({ message: 'Invalid bonus amount calculated' });

        // Grant Bonus to Main Balance
        user.balance = (user.balance || 0) + amount;
        await user.save();

        // Record History with Used Transactions
        await BonusHistory.create({
            userId: user._id,
            bonusId: bonus.id,
            amount: amount,
            bonusType: bonus.type,
            used_transaction_ids: qualifyingTransactions.map(t => t._id)
        });

        // Create Transaction
        await Transaction.create({
            user_id: user._id,
            type: 'bonus',
            amount: amount,
            status: 'completed',
            description: `Claimed bonus: ${bonus.title}`,
            balance_after: user.balance
        });

        res.json({ success: true, message: 'Bonus claimed successfully!', newBonusBalance: user.bonus_balance });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

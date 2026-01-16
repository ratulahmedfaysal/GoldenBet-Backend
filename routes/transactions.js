const router = require('express').Router();
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const speakeasy = require('speakeasy');
const SiteSettings = require('../models/SiteSettings');
const { DateTime } = require('luxon');

// Create Deposit (User)
router.post('/deposit', auth, async (req, res) => {
    try {
        const { method, amount, transaction_id, transaction_details, proof_image } = req.body;

        // Extract a transaction_id from details if not explicitly provided
        let txId = transaction_id;
        if (!txId && transaction_details) {
            txId = Object.values(transaction_details)[0];
        }

        const deposit = new Deposit({
            user_id: req.user,
            method,
            amount,
            transaction_id: txId,
            transaction_details,
            proof_image,
            status: 'pending'
        });

        await deposit.save();

        const user = await User.findById(req.user);

        await new Transaction({
            user_id: req.user,
            type: 'deposit',
            amount,
            balance_before: user.balance,
            balance_after: user.balance, // No change until approved
            description: `Deposit via ${method}`,
            status: 'pending',
            reference_id: deposit._id
        }).save();

        res.status(201).json({ message: 'Deposit request submitted successfully', deposit });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Create Withdrawal (User)
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { method, account_number, amount, two_factor_token } = req.body;

        // Fetch Site Settings for Schedule Check
        const settings = await SiteSettings.findOne({ key: 'main_settings' });
        if (settings && settings.withdrawal_schedule && settings.withdrawal_schedule.is_enabled) {
            const { days, start_time, end_time } = settings.withdrawal_schedule;

            // Format timezone from "UTC+06:00" to "UTC+6" for Luxon
            const zone = settings.timezone.replace('UTC', '').replace(':00', '').replace('+0', '+');
            const now = DateTime.now().setZone(`UTC${zone}`);

            const currentDay = now.toFormat('EEEE'); // e.g., "Monday"
            const currentTime = now.toFormat('HH:mm');

            if (!days.includes(currentDay)) {
                return res.status(403).json({ error: `Withdrawals are not available on ${currentDay}` });
            }

            if (currentTime < start_time || currentTime > end_time) {
                return res.status(403).json({ error: `Withdrawals are only available between ${start_time} and ${end_time} (${settings.timezone})` });
            }
        }

        const user = await User.findById(req.user);

        // 2FA Check
        if (user.two_factor_enabled) {
            if (!two_factor_token) {
                return res.status(400).json({ error: '2FA token required', two_factor_required: true });
            }
            const verified = speakeasy.totp.verify({
                secret: user.two_factor_secret,
                encoding: 'base32',
                token: two_factor_token
            });
            if (!verified) {
                return res.status(400).json({ error: 'Invalid 2FA token' });
            }
        }

        if (user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        const fee = 0; // Can be dynamic from settings
        const payable_amount = amount - fee;

        const withdrawal = new Withdrawal({
            user_id: req.user,
            method,
            account_number,
            amount,
            fee,
            payable_amount,
            status: 'pending'
        });

        await withdrawal.save();

        // Deduct balance immediately
        const balanceBefore = user.balance;
        user.balance -= amount;
        await user.save();

        await new Transaction({
            user_id: req.user,
            type: 'withdrawal',
            amount,
            balance_before: balanceBefore,
            balance_after: user.balance,
            description: `Withdrawal to ${method} (${account_number})`,
            status: 'pending',
            reference_id: withdrawal._id
        }).save();

        res.status(201).json({ message: 'Withdrawal request submitted successfully', withdrawal });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get User Transactions
router.get('/history', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user_id: req.user }).sort({ created_at: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

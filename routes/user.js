const router = require('express').Router();
const auth = require('../middleware/auth');
const Notice = require('../models/Notice');
const RedeemCode = require('../models/RedeemCode');
const User = require('../models/User');

const mongoose = require('mongoose');

// --- Notices ---
router.get('/notices', auth, async (req, res) => {
    try {
        // Fetch personal notices OR global notices
        console.log("Fetching notices for user:", req.user);

        let recipientId;
        try {
            recipientId = new mongoose.Types.ObjectId(req.user);
        } catch (e) {
            console.error("Invalid User ID in token:", req.user);
            return res.json([]); // Return empty if ID is invalid
        }

        const query = {
            $or: [
                { recipient: recipientId },
                { recipient: null }
            ]
        };

        const notices = await Notice.find(query).sort({ createdAt: -1 });

        // Debugging Aid: If empty, check generic count
        const totalNotices = await Notice.countDocuments({});
        const personalCount = await Notice.countDocuments({ recipient: req.user });

        console.log("Notices Query:", JSON.stringify(query));
        console.log("Found:", notices.length, "Total in DB:", totalNotices, "Matcing ID(string):", personalCount);

        res.json(notices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get('/notices/:id', auth, async (req, res) => {
    try {
        const notice = await Notice.findById(req.params.id);
        if (!notice) return res.status(404).json({ error: 'Notice not found' });

        // Security: Check ownership or global
        if (notice.recipient && notice.recipient.toString() !== req.user) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Mark as read logic
        let updated = false;
        if (notice.recipient && !notice.isRead) {
            notice.isRead = true;
            updated = true;
        }
        if (!notice.recipient && !notice.readBy.includes(req.user)) {
            notice.readBy.push(req.user);
            updated = true;
        }

        if (updated) await notice.save();

        res.json(notice);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Redeem Codes ---
router.post('/redeem', auth, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Code is required' });

        const redeemCode = await RedeemCode.findOne({ code: code.toUpperCase() });

        if (!redeemCode) return res.status(404).json({ error: 'Invalid code' });
        if (!redeemCode.isActive) return res.status(400).json({ error: 'Code is inactive' });
        if (redeemCode.expiresAt && new Date() > redeemCode.expiresAt) return res.status(400).json({ error: 'Code expired' });
        if (redeemCode.maxClaims > 0 && redeemCode.usedCount >= redeemCode.maxClaims) return res.status(400).json({ error: 'Code fully claimed' });

        // Check if user already claimed
        const alreadyClaimed = redeemCode.claimedBy.find(c => c.user.toString() === req.user);
        if (alreadyClaimed) return res.status(400).json({ error: 'You have already redeemed this code' });

        // Check restricted users
        if (redeemCode.allowedUsers && redeemCode.allowedUsers.length > 0) {
            const isAllowed = redeemCode.allowedUsers.some(uid => uid.toString() === req.user);
            if (!isAllowed) {
                return res.status(403).json({ error: 'This code is not valid for your account' });
            }
        }

        // Execute Redemption Validation & Update Atomically
        const updatedCode = await RedeemCode.findOneAndUpdate(
            {
                _id: redeemCode._id,
                'claimedBy.user': { $ne: req.user }, // Ensure user hasn't claimed
                $expr: {
                    $or: [
                        { $eq: ["$maxClaims", 0] }, // Unlimited
                        { $lt: ["$usedCount", "$maxClaims"] } // Still available
                    ]
                }
            },
            {
                $inc: { usedCount: 1 },
                $push: { claimedBy: { user: req.user } }
            },
            { new: true }
        );

        if (!updatedCode) {
            // Determine failure reason
            const check = await RedeemCode.findById(redeemCode._id);
            if (check.claimedBy.some(c => c.user.toString() === req.user)) {
                return res.status(400).json({ error: 'You have already redeemed this code' });
            }
            if (check.maxClaims > 0 && check.usedCount >= check.maxClaims) {
                return res.status(400).json({ error: 'Code fully claimed' });
            }
            return res.status(400).json({ error: 'Redemption failed' });
        }

        // Add balance to user
        const user = await User.findById(req.user);
        user.balance += updatedCode.rewardAmount;
        await user.save();

        res.json({ success: true, message: `Redeemed ${updatedCode.rewardAmount} successfully!`, newBalance: user.balance });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/redeem-history', auth, async (req, res) => {
    try {
        const history = await RedeemCode.find({
            'claimedBy.user': req.user
        }).select('code rewardAmount type claimedBy expiresAt');

        const formatted = history.map(h => {
            const claim = h.claimedBy.find(c => c.user.toString() === req.user);
            return {
                id: h._id,
                code: h.code,
                amount: h.rewardAmount,
                date: claim ? claim.claimedAt : null
            };
        });

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

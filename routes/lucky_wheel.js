const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const SpinHistory = require('../models/SpinHistory');

// Get available prizes
router.get('/prizes', async (req, res) => {
    try {
        const settings = await SiteSettings.findOne();
        const prizes = settings?.general?.luckyWheelPrizes || [];
        res.json(prizes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch prizes' });
    }
});

// Spin the wheel
router.get('/status', auth, async (req, res) => {
    try {
        const settings = await SiteSettings.findOne({ key: 'main_settings' });
        const config = settings?.general?.luckyWheel || { dailyFreeSpins: 3, isFreeSpinEnabled: true, spinCost: 0 };

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const user = await User.findById(req.user);
        const spinsToday = await SpinHistory.countDocuments({
            user: req.user,
            isFree: true,
            created_at: { $gte: startOfDay }
        });

        const dailyLimitRemaining = Math.max(0, config.dailyFreeSpins - spinsToday);
        const freeSpinsLeft = dailyLimitRemaining + (user?.extra_spins || 0);

        res.json({
            config,
            freeSpinsLeft,
            isFreeAvailable: config.isFreeSpinEnabled && freeSpinsLeft > 0,
            spinCost: config.spinCost
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

router.post('/spin', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const settings = await SiteSettings.findOne({ key: 'main_settings' }) || await SiteSettings.findOne();
        const wheelSettings = settings?.general?.luckyWheel || {
            dailyFreeSpins: 3,
            isFreeSpinEnabled: true,
            spinCost: 0.1
        };

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Count free spins used today
        const spinsToday = await SpinHistory.countDocuments({
            user: user._id,
            created_at: { $gte: startOfDay },
            isFree: true
        });

        // Check for daily free spins first, then extra spins
        let isFree = false;
        const dailyLimitRemaining = Math.max(0, wheelSettings.dailyFreeSpins - spinsToday);

        if (wheelSettings.isFreeSpinEnabled) {
            if (dailyLimitRemaining > 0) {
                isFree = true;
                // Consumes a daily spin (tracked by DB count)
            } else if ((user.extra_spins || 0) > 0) {
                isFree = true;
                // Consumes an extra spin
                user.extra_spins = (user.extra_spins || 0) - 1;
            }
        }

        // Handle payment for paid spins
        if (!isFree) {
            if (user.balance < wheelSettings.spinCost) {
                return res.status(400).json({ error: 'Insufficient balance for spin' });
            }
            user.balance -= wheelSettings.spinCost;
        }

        const prizes = settings?.general?.luckyWheelPrizes || [];
        if (!prizes.length) {
            return res.status(500).json({ error: 'No prizes configured' });
        }

        // Weighted random selection
        const totalChance = prizes.reduce((sum, prize) => sum + (prize.chance || 0), 0);
        let random = Math.random() * totalChance;
        let selectedPrize = prizes[0];

        for (const prize of prizes) {
            if (random < prize.chance) {
                selectedPrize = prize;
                break;
            }
            random -= prize.chance;
        }

        // Process reward
        if (selectedPrize.type === 'balance') {
            user.balance += selectedPrize.value;
        } else if (selectedPrize.type === 'spins') {
            user.extra_spins = (user.extra_spins || 0) + selectedPrize.value;
        }

        await user.save();

        // Record history
        const history = new SpinHistory({
            user: user._id,
            prize: {
                id: selectedPrize.id,
                label: selectedPrize.label,
                type: selectedPrize.type,
                value: selectedPrize.value
            },
            cost: isFree ? 0 : wheelSettings.spinCost,
            isFree: isFree
        });
        await history.save();

        // Calculate remaining spins for display
        // If we used a daily spin, spinsToday increases by 1 for next call.
        // For display NOW: 
        // If isFree (daily), remaining daily is dailyLimit - (spinsToday + 1).
        // If isFree (extra), user.extra_spins is already decremented.
        const dailyLeftAfterSpin = Math.max(0, wheelSettings.dailyFreeSpins - (spinsToday + (dailyLimitRemaining > 0 ? 1 : 0)));
        const totalSpinsRemaining = dailyLeftAfterSpin + (user.extra_spins || 0);

        res.json({
            success: true,
            prize: selectedPrize,
            isFree,
            cost: isFree ? 0 : wheelSettings.spinCost,
            spinsRemaining: totalSpinsRemaining,
            newBalance: user.balance
        });

    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ error: 'Spin failed' });
    }
});

// Get personal spin history
router.get('/history', auth, async (req, res) => {
    try {
        const history = await SpinHistory.find({ user: req.user })
            .sort({ created_at: -1 })
            .limit(50);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Admin: Get all spin history
router.get('/admin/history', auth, async (req, res) => {
    try {
        // Check if admin (middleware 'isAdmin' should be used but for now let's check user model)
        const user = await User.findById(req.user);
        if (user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

        const filter = {};
        if (req.query.userId) {
            filter.user = req.query.userId;
        }

        const history = await SpinHistory.find(filter)
            .populate('user', 'username email')
            .sort({ created_at: -1 })
            .limit(100);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch admin history' });
    }
});

module.exports = router;

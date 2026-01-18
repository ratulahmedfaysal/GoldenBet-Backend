const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Helper to generate referral code
const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, phone, referred_by } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Please enter all required fields' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or Email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedHeight = await bcrypt.hash(password, salt);

        const referral_code = generateReferralCode();

        const newUser = new User({
            username,
            email,
            password: hashedHeight,
            phone,
            referral_code,
            referred_by
        });

        const savedUser = await newUser.save();

        const token = jwt.sign({ id: savedUser._id }, process.env.JWT_SECRET);

        res.json({
            token,
            user: {
                id: savedUser._id,
                username: savedUser.username,
                email: savedUser.email,
                role: savedUser.role,
                balance: savedUser.balance,
                referral_code: savedUser.referral_code
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Please enter all fields' });
        }

        const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
        if (!user) return res.status(400).json({ error: 'User does not exist' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        // If 2FA is enabled, don't send final token yet
        if (user.two_factor_enabled) {
            return res.json({
                two_factor_required: true,
                user_id: user._id
            });
        }

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                balance: user.balance,
                referral_code: user.referral_code
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get User
router.get('/user', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user).select('-password -two_factor_secret');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Referrals
router.get('/referrals', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);
        const referrals = await User.find({ referred_by: user.referral_code }).select('username email created_at status total_deposit');
        res.json(referrals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2FA System ---

// Generate 2FA Secret
router.post('/2fa/generate', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);
        const secret = speakeasy.generateSecret({
            name: `GoldenBet (${user.email})`
        });

        user.two_factor_secret = secret.base32;
        await user.save();

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        res.json({ secret: secret.base32, qrCode: qrCodeUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify and Enable 2FA
router.post('/2fa/enable', auth, async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user);

        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token
        });

        if (verified) {
            user.two_factor_enabled = true;
            await user.save();
            res.json({ success: true, message: '2FA enabled successfully' });
        } else {
            res.status(400).json({ error: 'Invalid verification token' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Disable 2FA
router.post('/2fa/disable', auth, async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user);

        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token
        });

        if (verified) {
            user.two_factor_enabled = false;
            user.two_factor_secret = undefined;
            await user.save();
            res.json({ success: true, message: '2FA disabled successfully' });
        } else {
            res.status(400).json({ error: 'Invalid verification token' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify 2FA Token during Login
router.post('/2fa/verify-login', async (req, res) => {
    try {
        const { user_id, token } = req.body;
        const user = await User.findById(user_id);

        if (!user) return res.status(400).json({ error: 'User not found' });

        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token
        });

        if (verified) {
            const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
            res.json({
                token: jwtToken,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    balance: user.balance,
                    referral_code: user.referral_code
                }
            });
        } else {
            res.status(400).json({ error: 'Invalid verification token' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Password
router.post('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Please enter all fields' });
        }

        const user = await User.findById(req.user);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid current password' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

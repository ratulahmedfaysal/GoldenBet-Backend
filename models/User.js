const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
    balance: { type: Number, default: 0 },
    bonus_balance: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },
    is_banned: { type: Boolean, default: false },
    referral_code: { type: String, unique: true },
    referred_by: { type: String }, // Code of the referrer
    total_deposit: { type: Number, default: 0 },
    total_withdrawal: { type: Number, default: 0 },
    extra_spins: { type: Number, default: 0 },
    two_factor_enabled: { type: Boolean, default: false },
    two_factor_secret: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);

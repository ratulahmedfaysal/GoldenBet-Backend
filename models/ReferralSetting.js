const mongoose = require('mongoose');

const referralSettingSchema = new mongoose.Schema({
    system_type: { type: String, required: true, enum: ['deposit', 'investment', 'matching', 'career'], default: 'deposit' },
    level_number: { type: Number, required: true },
    commission_percentage: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },

    // Career/Matching specific
    required_referrals: { type: Number, default: 0 },
    required_investment: { type: Number, default: 0 },
    required_team_volume: { type: Number, default: 0 },

    // Reward can be fixed or percentage (for career)
    reward_type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    reward_amount: { type: Number, default: 0 }, // For fixed reward

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReferralSetting', referralSettingSchema);

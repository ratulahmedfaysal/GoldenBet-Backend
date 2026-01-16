const mongoose = require('mongoose');

const userReferralSchema = new mongoose.Schema({
    referrer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referred_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    level: { type: Number, required: true },
    commission_earned: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserReferral', userReferralSchema);

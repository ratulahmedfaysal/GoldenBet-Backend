const mongoose = require('mongoose');

const bonusHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bonusId: { type: Number, required: true }, // ID from SiteSettings
    amount: { type: Number, required: true }, // Amount credited
    bonusType: { type: String }, // e.g., 'Welcome', 'Reload'
    claimedAt: { type: Date, default: Date.now },
    used_transaction_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }] // Transactions consumed by this bonus
});

// Index to quickly check if a user has claimed a specific bonus
bonusHistorySchema.index({ userId: 1, bonusId: 1 });

module.exports = mongoose.model('BonusHistory', bonusHistorySchema);

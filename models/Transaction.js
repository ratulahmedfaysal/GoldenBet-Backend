const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'withdrawal', 'game_win', 'game_loss', 'bonus', 'referral_commission'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'approved', 'rejected'], default: 'completed' },
    balance_before: { type: Number, default: 0 },
    balance_after: { type: Number, default: 0 },
    reference_id: { type: mongoose.Schema.Types.ObjectId },
    description: String,
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);

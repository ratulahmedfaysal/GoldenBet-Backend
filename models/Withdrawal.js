const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, required: true },
    account_number: { type: String, required: true },
    amount: { type: Number, required: true },
    fee: { type: Number, default: 0 },
    payable_amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_notes: String,
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);

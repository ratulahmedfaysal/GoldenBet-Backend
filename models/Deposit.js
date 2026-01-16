const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, required: true }, // bKash, Rocket, Nagad, Crypto etc.
    amount: { type: Number, required: true },
    transaction_id: { type: String, index: { unique: true, sparse: true } },
    transaction_details: { type: Map, of: String },
    proof_image: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_notes: String,
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Deposit', depositSchema);

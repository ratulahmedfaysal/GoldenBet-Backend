const mongoose = require('mongoose');

const coinPaymentsSettingsSchema = new mongoose.Schema({
    merchant_id: { type: String, required: true },
    public_key: { type: String, required: true },
    private_key: { type: String, required: true },
    ipn_secret: { type: String, required: true },
    is_active: { type: Boolean, default: false },
    accepted_coins: [{ type: String }],
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CoinPaymentsSettings', coinPaymentsSettingsSchema);

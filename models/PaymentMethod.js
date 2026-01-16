const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
    method_name: { type: String, required: true },
    currency_name: { type: String, required: true },
    method_image_url: String,
    currency_rate: { type: Number, default: 1 },
    min_amount: { type: Number, default: 0 },
    max_amount: { type: Number, default: 1000000 },
    fee_percentage: { type: Number, default: 0 },
    instruction: String,
    required_fields: [String],
    method_type: { type: String, enum: ['deposit', 'withdrawal', 'both'], default: 'both' },
    is_active: { type: Boolean, default: true },
    is_automatic: { type: Boolean, default: false },
    gateway_type: { type: String, enum: ['manual', 'coinpayments'], default: 'manual' },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);

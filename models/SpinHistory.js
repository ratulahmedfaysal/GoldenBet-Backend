const mongoose = require('mongoose');

const spinHistorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    prize: {
        id: Number,
        label: String,
        type: { type: String, enum: ['balance', 'spins'] },
        value: Number
    },
    cost: {
        type: Number,
        default: 0
    },
    isFree: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['pending', 'claimed'],
        default: 'claimed'
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SpinHistory', spinHistorySchema);

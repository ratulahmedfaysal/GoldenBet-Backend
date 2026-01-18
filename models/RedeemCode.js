const mongoose = require('mongoose');

const redeemCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    rewardAmount: {
        type: Number,
        required: true,
        min: 0
    },
    maxClaims: {
        type: Number,
        default: 0 // 0 means unlimited (but typically restricted by allowedUsers or expiry)
    },
    usedCount: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        enum: ['public', 'private'], // public = anyone (up to maxClaims), private = specific users in allowedUsers
        default: 'public'
    },
    allowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    expiresAt: {
        type: Date,
        default: null // null means never expires
    },
    claimedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        claimedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RedeemCode', redeemCodeSchema);

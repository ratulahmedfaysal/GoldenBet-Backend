const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null, // null means "Everyone"
    },
    type: {
        type: String,
        enum: ['personal', 'global'],
        default: 'personal' // Helper to distinguish quickly
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String, // Can contain HTML
        required: true
    },
    image: {
        type: String, // URL to image
        default: ''
    },
    isRead: {
        type: Boolean,
        default: false
    },
    // For global notices, we might want to track who read it in a separate way or just show it until dismissed. 
    // To keep it simple for now as requested: 
    // "admin can send direct personally notice... or mark that send to everyone"
    // If sent to everyone, we can create a single record with recipient=null.
    // BUT user needs to "see those notice from dashboard". 
    // If we only have one record for "everyone", how do we track if User A read it?
    // OPTION A: Create individual records for ALL users (can be heavy).
    // OPTION B: Store `readBy: [ObjectId]` in the single global notice.
    // Let's go with OPTION B for efficiency for "everyone" messages.
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

// Index for faster queries
noticeSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notice', noticeSchema);

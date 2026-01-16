const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    image_url: String,
    author: { type: String, default: 'Admin' },
    status: { type: String, enum: ['published', 'draft'], default: 'published' },
    type: { type: String, enum: ['post', 'promotion'], default: 'post' },
    tags: [String],
    expiryDate: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Update updated_at on save
// Update updated_at on save - using async/await pattern or just setting it if needed
blogSchema.pre('save', function () {
    this.updated_at = Date.now();
});

module.exports = mongoose.model('Blog', blogSchema);

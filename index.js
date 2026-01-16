const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/payment-methods', require('./routes/payment_methods'));
app.use('/api/database', require('./routes/database'));
app.use('/api/blogs', require('./routes/blog'));
app.use('/api/lucky-wheel', require('./routes/lucky_wheel'));
app.use('/api/bonuses', require('./routes/bonuses'));

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'GoldenBet Backend is running',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.send('GoldenBet API is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;

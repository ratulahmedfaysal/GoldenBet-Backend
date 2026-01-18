const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'main_settings' },
    general: {
        siteName: { type: String, default: 'GoldenBet' },
        currencySymbol: { type: String, default: '৳' },
        metaTitle: { type: String, default: '' },
        metaDescription: { type: String, default: '' },
        footerBio: { type: String, default: 'Experience the thrill of premium online gaming with the most trusted casino platform.' },
        supportEmail: { type: String, default: 'support@goldbet.com' },
        socialLinks: {
            facebook: { type: String, default: '#' },
            twitter: { type: String, default: '#' },
            instagram: { type: String, default: '#' },
            telegram: { type: String, default: '#' },
            whatsapp: { type: String, default: '#' }
        },
        tawkTo: {
            isEnabled: { type: Boolean, default: false },
            widgetId: { type: String, default: '' }
        },
        luckyWheelPrizes: [{
            id: Number,
            label: String,
            type: { type: String, enum: ['balance', 'spins'], default: 'balance' },
            value: Number,
            color: String,
            chance: { type: Number, default: 10 } // Percentage chance
        }],
        luckyWheel: {
            dailyFreeSpins: { type: Number, default: 3 },
            isFreeSpinEnabled: { type: Boolean, default: true },
            spinCost: { type: Number, default: 0.1 }
        },
        banners: [{
            id: Number,
            title: String,
            subtitle: String,
            description: String,
            cta: String,
            link: String,
            image: String, // URL or base64
            gradient: String,
            accent: String,
            order: { type: Number, default: 0 }
        }],
        bonuses: [{
            id: Number,
            title: String,
            // Deprecated: amount (string), use rewardAmount + rewardType instead
            amount: String,
            description: String,
            features: [String],
            type: { type: String },
            link: String,
            isActive: { type: Boolean, default: true },
            autoClaim: { type: Boolean, default: false },

            // New Advanced Fields
            rewardType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
            rewardAmount: { type: Number, default: 0 }, // Value (e.g. 500 or 10)
            expiryDate: { type: Date }, // Overall bonus expiry

            criteria: [{
                type: {
                    type: String,
                    enum: ['min_deposit', 'valid_referrals', 'referrals_date_range', 'deposit_date_range'],
                    required: true
                },
                value: { type: Number, default: 0 }, // Threshold amount/count
                startDate: Date,
                endDate: Date
            }],

            wagerReq: { type: Number, default: 0 }
        }],
        promotions: [{
            id: Number,
            title: String,
            description: String,
            tag: String,
            color: String,
            isActive: { type: Boolean, default: true },
            expiryDate: { type: Date },
            instruction: String,
            reward: String
        }],
        vipLevels: [{
            level: { type: Number, required: true },
            name: { type: String, required: true },
            minDeposit: { type: Number, default: 0 },
            rewardAmount: { type: Number, default: 0 },
            color: { type: String, default: '#fbbf24' }, // Gold default
            perks: [String]
        }],
        referralLevels: [{
            level: { type: Number, required: true },
            name: { type: String, required: true },
            minReferrals: { type: Number, default: 0 },
            commission: { type: Number, default: 5 }, // Percentage
            color: { type: String, default: '#fbbf24' },
            perks: [String]
        }]
    },
    contact: {
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        address: { type: String, default: '' },
    },
    socials: {
        telegram: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        twitter: { type: String, default: '' },
        instagram: { type: String, default: '' },
        facebook: { type: String, default: '' }
    },
    footer: mongoose.Schema.Types.Mixed,
    hero: mongoose.Schema.Types.Mixed,
    section_headers: mongoose.Schema.Types.Mixed,
    faqs: Array,
    howItWorks: Array,
    whyChooseUs: Array,
    pages: {
        rules: { type: String, default: '' },
        privacy: { type: String, default: '' },
        terms: { type: String, default: '' }
    },
    reviews: Array,
    livePerformance: {
        totalProfitPaid: { type: String, default: '$0.00' }
    },
    diversificationItems: [{
        id: String,
        title: String,
        description: String,
        icon: String,
        features: [String]
    }],
    withdrawal_schedule: {
        days: { type: [String], default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
        start_time: { type: String, default: '00:00' },
        end_time: { type: String, default: '23:59' },
        is_enabled: { type: Boolean, default: false }
    },
    timezone: { type: String, default: 'UTC+06:00' }

}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);

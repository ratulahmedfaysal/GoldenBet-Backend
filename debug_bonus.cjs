const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const SiteSettings = require('./models/SiteSettings');
const BonusHistory = require('./models/BonusHistory');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Load env from root

async function checkEligibility(user, bonus) {
    console.log(`Checking Bonus: ${bonus.title} (ID: ${bonus.id})`);

    if (!bonus || !bonus.isActive) return { eligible: false, reason: 'Bonus inactive' };

    if (bonus.expiryDate && new Date() > new Date(bonus.expiryDate)) {
        return { eligible: false, reason: 'Bonus expired' };
    }

    const claimed = await BonusHistory.findOne({ userId: user._id, bonusId: bonus.id });
    if (claimed) return { eligible: false, reason: 'Already claimed' };

    let criteriaResults = [];
    let allCriteriaMet = true;

    if (bonus.criteria && bonus.criteria.length > 0) {
        for (const criterion of bonus.criteria) {
            console.log(`  Checking Criterion: ${criterion.type}`);
            console.log(`    Config:`, criterion);

            let met = false;
            let current = 0;
            let required = criterion.value;

            if (criterion.type === 'min_deposit' || criterion.type === 'deposit_date_range') {
                let userDeposit = user.total_deposit;
                console.log(`    User Base Total Deposit (Global): ${userDeposit}`);

                if (criterion.startDate || criterion.endDate) {
                    const query = {
                        user_id: user._id,
                        type: 'deposit',
                        status: 'completed'
                    };
                    if (criterion.startDate) {
                        query.created_at = { ...query.created_at, $gte: new Date(criterion.startDate) };
                        console.log(`    Start Date Filter: >= ${new Date(criterion.startDate).toISOString()}`);
                    }
                    if (criterion.endDate) {
                        query.created_at = query.created_at || {};
                        // CURRENT LOGIC (likely failure point): matches server/routes/bonuses.js
                        query.created_at.$lte = new Date(criterion.endDate);
                        console.log(`    End Date Filter: <= ${new Date(criterion.endDate).toISOString()}`);
                    }

                    console.log(`    Full Query:`, JSON.stringify(query, null, 2));

                    const deposits = await Transaction.find(query);
                    console.log(`    Found ${deposits.length} deposits in range.`);
                    deposits.forEach(d => console.log(`      - Amount: ${d.amount}, Date: ${d.created_at.toISOString()}`));

                    userDeposit = deposits.reduce((sum, tx) => sum + tx.amount, 0);
                    console.log(`    Calculated Range Deposit: ${userDeposit}`);
                }
                current = userDeposit;
                if (userDeposit >= criterion.value) met = true;
            }

            console.log(`    Result: Met=${met}, Current=${current}, Required=${required}`);
            if (!met) allCriteriaMet = false;
        }
    }

    return { eligible: allCriteriaMet };
}

async function debug() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const user = await User.findOne().sort({ updated_at: -1 });
        if (!user) { console.log('No user found'); return; }
        console.log(`User found: ${user.username} (${user._id})`);

        const settings = await SiteSettings.findOne();
        const bonuses = settings.general.bonuses || [];
        console.log(`Found ${bonuses.length} bonuses in SiteSettings`);

        for (const bonus of bonuses) {
            console.log('===========================================');
            const result = await checkEligibility(user, bonus);
            console.log(`> Final Eligibility for ${bonus.title}:`, result);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

debug();

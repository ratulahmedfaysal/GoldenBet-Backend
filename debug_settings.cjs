const mongoose = require('mongoose');
const SiteSettings = require('./models/SiteSettings');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const fs = require('fs');

async function debug() {
    let log = '';
    const print = (str) => { console.log(str); log += str + '\n'; };

    try {
        print('Env keys: ' + Object.keys(process.env).join(', '));
        print('MONGODB_URI: ' + process.env.MONGODB_URI);

        if (!process.env.MONGODB_URI) {
            print('Trying Hardcoded URI...');
            process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/goldenbet';
        }

        await mongoose.connect(process.env.MONGODB_URI);
        print('Connected to DB');

        const count = await SiteSettings.countDocuments();
        print(`Total SiteSettings documents: ${count}`);

        const allSettings = await SiteSettings.find();
        allSettings.forEach((s, i) => {
            print(`--- Doc ${i + 1} ---`);
            print(`ID: ${s._id}`);
            print(`Key: ${s.key}`);
            print(`Bonus Count: ${s.general?.bonuses?.length || 0}`);
            if (s.general?.bonuses?.length > 0) {
                print('Sample Bonus: ' + s.general.bonuses[0].title);
            }
        });

        fs.writeFileSync('debug_result.txt', log);

    } catch (err) {
        console.error(err);
        fs.writeFileSync('debug_result.txt', 'Error: ' + err.message);
    } finally {
        await mongoose.disconnect();
    }
}

debug();

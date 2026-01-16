require('dotenv').config();
const mongoose = require('mongoose');
const SiteSettings = require('./models/SiteSettings');

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/1win';

mongoose.connect(dbURI)
    .then(async () => {
        console.log('Connected to MongoDB');

        // Check main settings
        // Check ALL settings
        // Check specific user document
        const targetId = '6969048d52b42cfd9872ee93';
        console.log('Search for ID:', targetId);

        try {
            const richDoc = await SiteSettings.findById(targetId);
            if (richDoc) {
                console.log('--- FOUND RICH DOC ---');
                console.log('ID:', richDoc._id);
                console.log('Key:', richDoc.key);
                console.log('VIP Levels:', richDoc.general?.vipLevels?.length);
            } else {
                console.log('Could not find rich doc with ID:', targetId);

                // Check if we are even in the right DB??
                const count = await SiteSettings.countDocuments();
                console.log('Total docs in this DB:', count);
                console.log('Connected to DB Name:', mongoose.connection.name);
            }
        } catch (e) {
            console.log('Error searching for ID:', e.message);
        }

        mongoose.connection.close();
    })
    .catch(err => console.error(err));

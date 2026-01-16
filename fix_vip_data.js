require('dotenv').config();
const mongoose = require('mongoose');
const SiteSettings = require('./models/SiteSettings');

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/1win';

mongoose.connect(dbURI)
    .then(async () => {
        console.log('Connected to MongoDB');

        const sourceId = '6969048d52b42cfd9872ee93'; // Has VIP levels
        const targetId = '69690834a26abc93bd491f27'; // Has 'main_settings' key

        console.log(`Source ID: ${sourceId}`);
        console.log(`Target ID: ${targetId}`);

        try {
            const sourceDoc = await SiteSettings.findById(sourceId);
            const targetDoc = await SiteSettings.findById(targetId);

            if (!sourceDoc) {
                console.error('Source document not found!');
                process.exit(1);
            }
            if (!targetDoc) {
                console.error('Target document not found!');
                process.exit(1);
            }

            console.log(`Found Source. VIP Levels: ${sourceDoc.general?.vipLevels?.length || 0}`);
            console.log(`Found Target. VIP Levels: ${targetDoc.general?.vipLevels?.length || 0}`);

            if (sourceDoc.general?.vipLevels?.length > 0) {
                // Copy levels
                if (!targetDoc.general) targetDoc.general = {};
                targetDoc.general.vipLevels = sourceDoc.general.vipLevels;

                await targetDoc.save();
                console.log('✅ SUCCESSFULLY COPIED VIP LEVELS TO MAIN SETTINGS!');
                console.log('You can now refresh the Admin Panel.');
            } else {
                console.log('⚠️ Source document has no VIP levels to copy.');
            }

        } catch (err) {
            console.error('Error:', err);
        }

        mongoose.connection.close();
    })
    .catch(err => console.error(err));

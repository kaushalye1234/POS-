const mongoose = require('mongoose');
const User = require('./models/User');
const { connectMongo, redactMongoUri } = require('./mongoConnection');

async function seed() {
    const connection = await connectMongo(mongoose);
    console.log(`Connecting to MongoDB at: ${redactMongoUri(connection.uri)} (${connection.source})`);

    try {
        // Check if admin exists
        let adminUser = await User.findOne({ username: 'admin' });
        if (!adminUser) {
            adminUser = new User({
                username: 'admin',
                password: 'adminpassword',
                role: 'admin',
                pin: '1234',
                employeeId: 'E001'
            });
            await adminUser.save();
            console.log('Admin user created successfully!');
        } else {
            console.log('Admin user already exists.');
        }

        // Check if cashier exists
        let cashierUser = await User.findOne({ username: 'cashier' });
        if (!cashierUser) {
            cashierUser = new User({
                username: 'cashier',
                password: 'cashierpassword',
                role: 'cashier',
                pin: '5678',
                employeeId: 'E002'
            });
            await cashierUser.save();
            console.log('Cashier user created successfully!');
        } else {
            console.log('Cashier user already exists.');
        }

        console.log('Database seeding complete!');
    } catch (e) {
        console.error('Seeding failed:', e);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});

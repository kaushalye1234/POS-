const mongoose = require('mongoose');
const User = require('./models/User');
const { bootstrapAdmin } = require('./scripts/bootstrap-admin');
const { connectMongo, redactMongoUri } = require('./mongoConnection');

async function seed() {
    const summary = await bootstrapAdmin();
    console.log(`Admin bootstrap complete via ${summary.connectedSource}: ${summary.connectedUri}`);
    console.log(`Admin account ready: ${summary.username} (${summary.employeeId})`);
    console.log(`Integration users removed: ${summary.removedIntegrationUsers}`);

    const connection = await connectMongo(mongoose);
    console.log(`Connecting to MongoDB at: ${redactMongoUri(connection.uri)} (${connection.source})`);

    try {
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

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});

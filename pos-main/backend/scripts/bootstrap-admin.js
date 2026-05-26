const mongoose = require('mongoose');
const User = require('../models/User');
const { connectMongo, redactMongoUri } = require('../mongoConnection');

const INTEGRATION_USERNAMES = [
    'integration_admin',
    'integration_admin_local',
    'integration_admin_memory',
    'integration_admin_smoke'
];

function readArgument(name) {
    const prefix = `--${name}=`;
    const directPrefix = `--${name}`;
    const args = process.argv.slice(2);

    const inlineMatch = args.find((arg) => arg.startsWith(prefix));
    if (inlineMatch) {
        return inlineMatch.slice(prefix.length);
    }

    const index = args.findIndex((arg) => arg === directPrefix);
    if (index !== -1 && index + 1 < args.length) {
        return args[index + 1];
    }

    return '';
}

function buildBootstrapOptions(overrides = {}) {
    return {
        username: String(
            overrides.username
            || process.env.FASHION_SHAA_ADMIN_USERNAME
            || readArgument('admin-username')
            || 'admin'
        ).trim().toLowerCase(),
        password: String(
            overrides.password
            || process.env.FASHION_SHAA_ADMIN_PASSWORD
            || readArgument('admin-password')
            || 'adminpassword'
        ),
        pin: String(
            overrides.pin
            || process.env.FASHION_SHAA_ADMIN_PIN
            || readArgument('admin-pin')
            || '1234'
        ),
        employeeId: String(
            overrides.employeeId
            || process.env.FASHION_SHAA_ADMIN_EMPLOYEE_ID
            || readArgument('admin-employee-id')
            || 'E001'
        ).trim().toUpperCase()
    };
}

async function bootstrapAdmin(rawOptions = {}) {
    const options = buildBootstrapOptions(rawOptions);
    const connection = await connectMongo(mongoose);

    const summary = {
        connectedSource: connection.source,
        connectedUri: redactMongoUri(connection.uri),
        username: options.username,
        employeeId: options.employeeId,
        created: false,
        updated: false,
        removedIntegrationUsers: 0
    };

    try {
        let adminUser = await User.findOne({ username: options.username });

        if (!adminUser) {
            adminUser = new User({
                username: options.username,
                password: options.password,
                role: 'admin',
                pin: options.pin,
                employeeId: options.employeeId,
                isActive: true
            });
            summary.created = true;
        } else {
            adminUser.password = options.password;
            adminUser.role = 'admin';
            adminUser.pin = options.pin;
            adminUser.employeeId = options.employeeId;
            adminUser.isActive = true;
            summary.updated = true;
        }

        await adminUser.save();

        const deletionResult = await User.deleteMany({
            username: { $in: INTEGRATION_USERNAMES.filter((username) => username !== options.username) }
        });
        summary.removedIntegrationUsers = deletionResult.deletedCount || 0;

        return summary;
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
}

if (require.main === module) {
    bootstrapAdmin()
        .then((summary) => {
            process.stdout.write(`${JSON.stringify(summary)}\n`);
        })
        .catch((error) => {
            const payload = {
                error: error?.message || String(error)
            };
            process.stderr.write(`${JSON.stringify(payload)}\n`);
            process.exit(1);
        });
}

module.exports = {
    bootstrapAdmin,
    buildBootstrapOptions,
    INTEGRATION_USERNAMES
};

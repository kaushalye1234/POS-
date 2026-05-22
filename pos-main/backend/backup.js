#!/usr/bin/env node
/**
 * Fashion Shaa POS — MongoDB Backup Utility (DB-004)
 * 
 * Usage:
 *   node backup.js                    → Backup to ./backups/
 *   node backup.js --restore latest   → Restore latest backup
 *   node backup.js --restore <path>   → Restore specific backup
 * 
 * Requires: mongodump and mongorestore in PATH
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { mongoUri: MONGO_URI } = require('./config');
const BACKUP_DIR = path.join(__dirname, 'backups');

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function backup() {
    const backupPath = path.join(BACKUP_DIR, `backup_${timestamp()}`);
    ensureDir(backupPath);

    console.log(`\n🔄 Backing up database...`);
    console.log(`   URI: ${MONGO_URI}`);
    console.log(`   To:  ${backupPath}\n`);

    try {
        execSync(`mongodump --uri="${MONGO_URI}" --out="${backupPath}"`, { stdio: 'inherit' });
        console.log(`\n✅ Backup complete: ${backupPath}`);

        // Clean old backups (keep last 10)
        cleanOldBackups(10);
        return backupPath;
    } catch (err) {
        console.error('\n❌ Backup failed:', err.message);
        console.error('   Make sure mongodump is installed and in your PATH.');
        console.error('   Install: https://www.mongodb.com/try/download/database-tools');
        process.exit(1);
    }
}

function restore(target) {
    let restorePath;

    if (target === 'latest') {
        const backups = getBackupsList();
        if (backups.length === 0) {
            console.error('❌ No backups found in', BACKUP_DIR);
            process.exit(1);
        }
        restorePath = backups[backups.length - 1].path;
    } else {
        restorePath = path.resolve(target);
    }

    if (!fs.existsSync(restorePath)) {
        console.error('❌ Backup path not found:', restorePath);
        process.exit(1);
    }

    console.log(`\n🔄 Restoring database...`);
    console.log(`   URI:  ${MONGO_URI}`);
    console.log(`   From: ${restorePath}\n`);
    console.log('⚠️  WARNING: This will OVERWRITE existing data!\n');

    try {
        execSync(`mongorestore --uri="${MONGO_URI}" --drop "${restorePath}"`, { stdio: 'inherit' });
        console.log(`\n✅ Restore complete from: ${restorePath}`);
    } catch (err) {
        console.error('\n❌ Restore failed:', err.message);
        process.exit(1);
    }
}

function getBackupsList() {
    ensureDir(BACKUP_DIR);
    return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup_'))
        .sort()
        .map(f => ({ name: f, path: path.join(BACKUP_DIR, f) }));
}

function cleanOldBackups(keep = 10) {
    const backups = getBackupsList();
    if (backups.length <= keep) return;

    const toDelete = backups.slice(0, backups.length - keep);
    toDelete.forEach(b => {
        fs.rmSync(b.path, { recursive: true, force: true });
        console.log(`   🗑️  Cleaned old backup: ${b.name}`);
    });
}

function listBackups() {
    const backups = getBackupsList();
    if (backups.length === 0) {
        console.log('No backups found.');
        return;
    }
    console.log(`\n📦 Available backups (${backups.length}):\n`);
    backups.forEach((b, i) => {
        console.log(`   ${i + 1}. ${b.name}`);
    });
    console.log('');
}

// CLI
const args = process.argv.slice(2);

if (args[0] === '--restore') {
    restore(args[1] || 'latest');
} else if (args[0] === '--list') {
    listBackups();
} else {
    backup();
}

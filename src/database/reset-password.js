
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function resetPassword() {
    const config = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'leoni_db',
    };

    const client = new Client(config);

    try {
        await client.connect();

        console.log('Generating new hash for "password123"...');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('password123', salt);

        console.log(`New Hash: ${hash}`);

        console.log('Updating EMP001...');
        await client.query('UPDATE employees SET password = $1 WHERE matricule = $2', [hash, 'EMP001']);

        console.log('✅ Password for EMP001 reset to "password123"');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

resetPassword();

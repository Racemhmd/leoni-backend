
const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function unlockAccount() {
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

        console.log('Unlocking account EMP001...');
        await client.query('UPDATE employees SET failed_login_attempts = 0 WHERE matricule = $1', ['EMP001']);

        console.log('✅ Account EMP001 unlocked (failed_login_attempts reset to 0).');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

unlockAccount();

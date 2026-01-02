
const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function activateAccounts() {
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
        console.log('Checking user status...');

        const res = await client.query('SELECT id, matricule, is_active FROM employees');
        console.table(res.rows);

        const inactive = res.rows.filter(r => r.is_active !== true);

        if (inactive.length > 0) {
            console.log(`Found ${inactive.length} inactive accounts. Activating them...`);
            await client.query('UPDATE employees SET is_active = true');
            console.log('✅ All accounts activated.');
        } else {
            console.log('All accounts are already active. Strange.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

activateAccounts();

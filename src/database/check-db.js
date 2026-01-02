
const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkDb() {
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

        console.log('Checking if "employees" table exists...');
        const res = await client.query('SELECT count(*) FROM employees');

        console.log(`✅ Success! Table 'employees' exists and contains ${res.rows[0].count} records.`);
        console.log('Database verification passed.');

    } catch (err) {
        console.error('❌ Verification failed:', err.message);
    } finally {
        await client.end();
    }
}

checkDb();

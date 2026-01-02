const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'leoni_db',
};

async function fixDb() {
    const client = new Client(config);

    try {
        await client.connect();
        console.log('✅ Connected to DB');

        console.log('🗑️ Dropping view "pending_leave_requests"...');
        await client.query('DROP VIEW IF EXISTS pending_leave_requests CASCADE');
        console.log('✅ View dropped successfully.');

    } catch (err) {
        console.error('❌ Error during fix:', err);
    } finally {
        await client.end();
    }
}

fixDb();

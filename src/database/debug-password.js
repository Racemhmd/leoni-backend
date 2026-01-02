
const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkNulls() {
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
        console.log('Connected. Checking for employees with NULL passwords...');

        const res = await client.query('SELECT id, matricule, full_name, password FROM employees WHERE password IS NULL');

        if (res.rows.length > 0) {
            console.log(`❌ Found ${res.rows.length} employees with NULL password:`);
            console.table(res.rows);

            // Fix them?
            console.log('Attemping to fix by setting default password...');
            await client.query("UPDATE employees SET password = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a' WHERE password IS NULL");
            console.log('✅ Updated NULL passwords to default hash.');
        } else {
            console.log('✅ No employees with NULL password found. Strange if TypeORM is complaining.');

            // Check all
            const all = await client.query('SELECT id, matricule, password FROM employees');
            console.log('All employees:', all.rows);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

checkNulls();

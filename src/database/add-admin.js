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

async function addAdminUser() {
    const client = new Client(config);

    try {
        await client.connect();

        // Check if user already exists
        const checkRes = await client.query('SELECT id FROM employees WHERE matricule = $1', ['10364838']);
        if (checkRes.rows.length > 0) {
            console.log('Use Racem Hamdi (10364838) already exists. Skipping insertion.');
            return;
        }

        // Get HR_ADMIN role id (assuming it is 3 as per seed, but let's be safe)
        // Wait, schema seed inserts roles with Ids, but let's select by name
        const roleRes = await client.query("SELECT id FROM roles WHERE name = 'HR_ADMIN'");
        let roleId = 3;
        if (roleRes.rows.length > 0) {
            roleId = roleRes.rows[0].id;
        }

        const query = `
            INSERT INTO employees (matricule, full_name, email, department, password, role_id, points_balance, must_change_password)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, matricule, full_name;
        `;

        const values = [
            '10364838',
            'Racem Hamdi',
            null,
            'HR',
            '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a', // password123
            roleId,
            100,
            true
        ];

        const res = await client.query(query, values);
        console.log('✅ User created successfully:', res.rows[0]);

    } catch (err) {
        console.error('❌ Error creating user:', err);
    } finally {
        await client.end();
    }
}

addAdminUser();

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
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

async function testLogin() {
    const client = new Client(config);
    const matricule = '10364838';
    const password = 'password123';

    try {
        await client.connect();
        console.log(`Checking user: ${matricule}`);

        // 1. Fetch user
        const res = await client.query('SELECT * FROM employees WHERE matricule = $1', [matricule]);

        if (res.rows.length === 0) {
            console.error('❌ User not found in database!');
            return;
        }

        const user = res.rows[0];
        console.log('✅ User found:', { id: user.id, matricule: user.matricule, role_id: user.role_id });
        console.log('Stored Hash:', user.password);

        // 2. Compare password
        console.log(`Testing password: '${password}'`);
        const isValid = await bcrypt.compare(password, user.password);

        if (isValid) {
            console.log('✅ Password Match! Login should work.');
        } else {
            console.error('❌ Password Mismatch!');

            // Generate valid hash for comparison
            const newHash = await bcrypt.hash(password, 10);
            console.log('Expected hash should look like:', newHash);

            // Suggest fix
            console.log('\n--- ATTEMPTING FIX ---');
            await client.query('UPDATE employees SET password = $1 WHERE id = $2', [newHash, user.id]);
            console.log('✅ Password updated to fresh hash. Try logging in again.');
        }

    } catch (err) {
        console.error('❌ Error during test:', err);
    } finally {
        await client.end();
    }
}

testLogin();

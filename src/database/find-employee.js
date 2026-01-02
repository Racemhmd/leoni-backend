const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');

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
    const matricule = 'EMP003';
    const password = 'password123';

    try {
        await client.connect();
        const res = await client.query('SELECT * FROM employees WHERE matricule = $1', [matricule]);

        if (res.rows.length === 0) {
            console.log('User not found');
            return;
        }

        const user = res.rows[0];
        const isValid = await bcrypt.compare(password, user.password);

        if (isValid) {
            console.log(`SUCCESS: Login valid for ${matricule} / ${password}`);
        } else {
            console.log('FAIL: Password mismatch. Resetting...');
            const newHash = await bcrypt.hash(password, 10);
            await client.query('UPDATE employees SET password = $1 WHERE id = $2', [newHash, user.id]);
            console.log(`Password reset to ${password}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

testLogin();

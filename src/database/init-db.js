
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function initDb() {
    const config = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'leoni_db',
    };

    console.log(`Connecting to database ${config.database} at ${config.host}:${config.port}...`);

    const client = new Client(config);

    try {
        await client.connect();

        const schemaPath = path.join(__dirname, 'schema.sql');
        console.log(`Reading schema from ${schemaPath}...`);

        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema...');
        await client.query(schemaSql);

        console.log('✅ Database schema initialized successfully!');
    } catch (err) {
        if (err.code === '3D000') { // Database does not exist
            console.log(`Database '${config.database}' does not exist. Please create it first using 'CREATE DATABASE ${config.database};' in pgAdmin or psql.`);
        } else {
            console.error('❌ Error initializing database:', err);
        }
    } finally {
        await client.end();
    }
}

initDb();

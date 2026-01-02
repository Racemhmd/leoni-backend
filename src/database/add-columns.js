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

async function updateSchema() {
    const client = new Client(config);

    try {
        await client.connect();
        console.log('Connected to database...');

        // Add group column if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='group') THEN 
                    ALTER TABLE employees ADD COLUMN "group" VARCHAR(100); 
                    RAISE NOTICE 'Added group column';
                END IF;
            END $$;
        `);

        // Add plant column if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='plant') THEN 
                    ALTER TABLE employees ADD COLUMN plant VARCHAR(100); 
                    RAISE NOTICE 'Added plant column';
                END IF;
            END $$;
        `);

        console.log('✅ Schema updated successfully!');
    } catch (err) {
        console.error('❌ Error updating schema:', err);
    } finally {
        await client.end();
    }
}

updateSchema();

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

async function updateSchemaAudit() {
    const client = new Client(config);

    try {
        await client.connect();

        // Check if table exists
        const checkRes = await client.query("SELECT to_regclass('public.audit_logs')");
        if (checkRes.rows[0].to_regclass) {
            console.log('Audit logs table already exists. Skipping.');
            return;
        }

        const query = `
            CREATE TABLE audit_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                target_id INTEGER,
                target_entity VARCHAR(50),
                action VARCHAR(50) NOT NULL,
                details TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
            CREATE INDEX idx_audit_logs_target_id ON audit_logs(target_id);
            CREATE INDEX idx_audit_logs_action ON audit_logs(action);
            CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
        `;

        await client.query(query);
        console.log('✅ Audit logs table created successfully!');

    } catch (err) {
        console.error('❌ Error creating audit logs table:', err);
    } finally {
        await client.end();
    }
}

updateSchemaAudit();


import { DataSource } from 'typeorm';
import { User } from './src/database/entities/user.entity';
import { Role } from './src/database/entities/role.entity';
import { PointTransaction } from './src/database/entities/point-transaction.entity';
import { Event } from './src/database/entities/event.entity';
import { Absence } from './src/database/entities/absence.entity';
import { LeaveRequest } from './src/database/entities/leave.entity';
import { Notification } from './src/database/entities/notification.entity';
import { RefreshToken } from './src/database/entities/refresh-token.entity';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'leoni_db',
    entities: [User, Role, PointTransaction, Event, Absence, LeaveRequest, Notification, RefreshToken],
    synchronize: false,
});

async function debugUser() {
    try {
        await AppDataSource.initialize();
        console.log('Datasource initialized.');

        const repo = AppDataSource.getRepository(User);
        const user = await repo.findOne({
            where: { matricule: 'EMP001' }
        });

        console.log('--- USER DUMP ---');
        console.log(user);
        console.log('--- PROPERTY CHECK ---');
        console.log('isActive value:', user?.isActive);
        console.log('isActive type:', typeof user?.isActive);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await AppDataSource.destroy();
    }
}

debugUser();

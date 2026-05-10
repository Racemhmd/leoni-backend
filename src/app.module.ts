import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './database/entities/user.entity';
import { Role } from './database/entities/role.entity';
import { PointTransaction } from './database/entities/point-transaction.entity';
import { Event } from './database/entities/event.entity';
import { Absence } from './database/entities/absence.entity';
import { LeaveRequest } from './database/entities/leave.entity';
import { Notification } from './database/entities/notification.entity';
import { RefreshToken } from './database/entities/refresh-token.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { Liquidation } from './database/entities/liquidation.entity';
import { EmployeeSanction } from './database/entities/sanction-history.entity';
import { PasswordResetToken } from './database/entities/password-reset-token.entity';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AbsencesModule } from './modules/absences/absences.module';
import { PointsModule } from './modules/points/points.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { LiquidationModule } from './modules/liquidation/liquidation.module';
import { SanctionsModule } from './modules/sanctions/sanctions.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: (() => {
          const host = configService.get<string>('DB_HOST');
          if (!host) throw new Error('DB_HOST is not defined in environment variables! Please set it in Render Dashboard.');
          return host;
        })(),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [
          User,
          Role,
          PointTransaction,
          Event,
          Absence,
          LeaveRequest,
          Notification,
          LeaveRequest,
          Notification,
          RefreshToken,
          AuditLog,
          Liquidation,
          EmployeeSanction,
          PasswordResetToken,
        ],
        synchronize: (() => {
          const sync = String(configService.get<string>('DB_SYNCHRONIZE')).trim().toLowerCase() === 'true';
          console.log(`[Database] Synchronize: ${sync} (Value: "${configService.get<string>('DB_SYNCHRONIZE')}")`);
          return sync;
        })(), // Auto-create tables (safe to be false in prod)
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    AbsencesModule,
    PointsModule,
    LeavesModule,
    NotificationsModule,
    DashboardModule,
    AuditModule,
    LiquidationModule,
    SanctionsModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }



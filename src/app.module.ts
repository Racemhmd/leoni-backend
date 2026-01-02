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
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AbsencesModule } from './modules/absences/absences.module';
import { PointsModule } from './modules/points/points.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
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
          RefreshToken,
        ],
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true', // Auto-create tables (safe to be false in prod)
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }



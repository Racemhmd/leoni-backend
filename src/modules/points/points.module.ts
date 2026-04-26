import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsService } from './points.service';
import { PointsController } from './points.controller';
import { PointTransaction } from '../../database/entities/point-transaction.entity';
import { User } from '../../database/entities/user.entity';
import { Liquidation } from '../../database/entities/liquidation.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointTransaction, User, Liquidation]),
    NotificationsModule,
    AuditModule,
  ],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule { }

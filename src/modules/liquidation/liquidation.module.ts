import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LiquidationService } from './liquidation.service';
import { LiquidationController } from './liquidation.controller';
import { LiquidationScheduler } from './liquidation.scheduler';
import { Liquidation } from '../../database/entities/liquidation.entity';
import { PointTransaction } from '../../database/entities/point-transaction.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Liquidation, PointTransaction, User]),
        NotificationsModule,
        ScheduleModule, // Réutilise le ScheduleModule enregistré à la racine
    ],
    controllers: [LiquidationController],
    providers: [LiquidationService, LiquidationScheduler],
    exports: [LiquidationService],
})
export class LiquidationModule { }

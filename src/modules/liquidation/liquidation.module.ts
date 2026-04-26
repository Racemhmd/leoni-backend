import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiquidationService } from './liquidation.service';
import { Liquidation } from '../../database/entities/liquidation.entity';
import { PointTransaction } from '../../database/entities/point-transaction.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Liquidation, PointTransaction, User]),
        NotificationsModule,
    ],
    providers: [LiquidationService],
    exports: [LiquidationService],
})
export class LiquidationModule { }

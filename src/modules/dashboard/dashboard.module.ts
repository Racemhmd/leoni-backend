import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { UsersModule } from '../users/users.module';
import { PointsModule } from '../points/points.module';

@Module({
    imports: [UsersModule, PointsModule],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }

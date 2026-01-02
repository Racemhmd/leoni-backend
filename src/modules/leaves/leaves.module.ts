import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeavesService } from './leaves.service';
import { LeavesController } from './leaves.controller';
import { LeaveRequest } from '../../database/entities/leave.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LtgIntegrationService } from './ltg-integration.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([LeaveRequest, User]),
        NotificationsModule,
    ],
    controllers: [LeavesController],
    providers: [LeavesService, LtgIntegrationService],
    exports: [LeavesService],
})
export class LeavesModule { }

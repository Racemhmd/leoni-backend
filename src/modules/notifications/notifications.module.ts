import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { SmsService } from './sms.service';
import { Notification } from '../../database/entities/notification.entity';
import { User } from '../../database/entities/user.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Notification, User])],
    controllers: [NotificationsController],
    providers: [NotificationsService, PushService, SmsService],
    exports: [NotificationsService, PushService, SmsService],
})
export class NotificationsModule { }

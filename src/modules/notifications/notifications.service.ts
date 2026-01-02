import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private notificationsRepository: Repository<Notification>,
    ) { }

    async createNotification(dto: CreateNotificationDto): Promise<Notification> {
        const notification = this.notificationsRepository.create({
            employeeId: dto.employeeId,
            title: dto.title,
            message: dto.message,
            type: dto.type || NotificationType.INFO,
        });
        return this.notificationsRepository.save(notification);
    }

    async getUnreadNotifications(employeeId: number): Promise<Notification[]> {
        return this.notificationsRepository.find({
            where: { employeeId, isRead: false },
            order: { createdAt: 'DESC' },
        });
    }

    async getAllNotifications(employeeId: number): Promise<Notification[]> {
        return this.notificationsRepository.find({
            where: { employeeId },
            order: { createdAt: 'DESC' },
            take: 50, // Limit to last 50 notifications
        });
    }

    async markAsRead(notificationId: number, employeeId: number): Promise<void> {
        await this.notificationsRepository.update(
            { id: notificationId, employeeId },
            { isRead: true, readAt: new Date() },
        );
    }

    async markAllAsRead(employeeId: number): Promise<void> {
        await this.notificationsRepository.update(
            { employeeId, isRead: false },
            { isRead: true, readAt: new Date() },
        );
    }

    async getUnreadCount(employeeId: number): Promise<number> {
        return this.notificationsRepository.count({
            where: { employeeId, isRead: false },
        });
    }
}

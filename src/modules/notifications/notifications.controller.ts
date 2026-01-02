import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @ApiOperation({ summary: 'Get unread notifications' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('unread')
    async getUnread(@Request() req: any) {
        return this.notificationsService.getUnreadNotifications(req.user.id);
    }

    @ApiOperation({ summary: 'Get all notifications' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get()
    async getAll(@Request() req: any) {
        return this.notificationsService.getAllNotifications(req.user.id);
    }

    @ApiOperation({ summary: 'Get unread count' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('count')
    async getUnreadCount(@Request() req: any) {
        const count = await this.notificationsService.getUnreadCount(req.user.id);
        return { count };
    }

    @ApiOperation({ summary: 'Mark notification as read' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Patch(':id/read')
    async markAsRead(@Param('id') id: number, @Request() req: any) {
        await this.notificationsService.markAsRead(id, req.user.id);
        return { message: 'Notification marked as read' };
    }

    @ApiOperation({ summary: 'Mark all notifications as read' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Patch('read-all')
    async markAllAsRead(@Request() req: any) {
        await this.notificationsService.markAllAsRead(req.user.id);
        return { message: 'All notifications marked as read' };
    }
}

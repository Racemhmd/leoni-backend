import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../../database/entities/notification.entity';

export class CreateNotificationDto {
    @ApiProperty({ description: 'Employee ID to receive notification' })
    @IsNotEmpty()
    employeeId: number;

    @ApiProperty({ description: 'Notification title' })
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiProperty({ description: 'Notification message' })
    @IsNotEmpty()
    @IsString()
    message: string;

    @ApiProperty({ enum: NotificationType, default: NotificationType.INFO })
    @IsEnum(NotificationType)
    @IsOptional()
    type?: NotificationType;
}

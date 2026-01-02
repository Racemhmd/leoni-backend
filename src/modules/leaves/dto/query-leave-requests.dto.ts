import { IsOptional, IsEnum, IsDateString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaveStatus } from '../../../database/entities/leave.entity';
import { Type } from 'class-transformer';

export class QueryLeaveRequestsDto {
    @ApiProperty({ enum: LeaveStatus, required: false })
    @IsOptional()
    @IsEnum(LeaveStatus)
    status?: LeaveStatus;

    @ApiProperty({ required: false, description: 'Employee ID to filter by' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    employeeId?: number;

    @ApiProperty({ required: false, description: 'Filter by start date (YYYY-MM-DD)' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiProperty({ required: false, description: 'Filter by end date (YYYY-MM-DD)' })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}

import { IsNotEmpty, IsEnum, IsDateString, IsString, IsOptional, MinLength, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaveType } from '../../../database/entities/leave.entity';

export class CreateLeaveRequestDto {
    @ApiProperty({ enum: LeaveType, description: 'Type of leave' })
    @IsNotEmpty()
    @IsEnum(LeaveType)
    leaveType: LeaveType;

    @ApiProperty({ description: 'Start date of leave (YYYY-MM-DD)' })
    @IsNotEmpty()
    @IsDateString()
    startDate: string;

    @ApiProperty({ description: 'End date of leave (YYYY-MM-DD)' })
    @IsNotEmpty()
    @IsDateString()
    endDate: string;

    @ApiProperty({ example: 2, description: 'ID of the supervisor selected for approval' })
    @IsInt()
    @IsNotEmpty()
    supervisorId: number;

    @ApiProperty({ example: 3, description: 'ID of the HR Admin selected for approval' })
    @IsInt()
    @IsNotEmpty()
    hrAdminId: number;

    @ApiProperty({ example: 'Family emergency', description: 'Reason for leave', required: false })
    @IsOptional()
    @IsString()
    reason?: string;
}

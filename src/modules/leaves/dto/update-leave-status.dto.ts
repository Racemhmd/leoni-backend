import { IsNotEmpty, IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaveStatus } from '../../../database/entities/leave.entity';

export class UpdateLeaveStatusDto {
    @ApiProperty({ enum: [LeaveStatus.APPROVED, LeaveStatus.REJECTED], description: 'New status' })
    @IsNotEmpty()
    @IsEnum(LeaveStatus)
    status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;

    @ApiProperty({ description: 'Review notes (optional)', required: false })
    @IsOptional()
    @IsString()
    reviewNotes?: string;
}

import { IsNotEmpty, IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ApprovalAction {
    APPROVE = 'APPROVE',
    REJECT = 'REJECT',
}

export class ApproveLeaveRequestDto {
    @ApiProperty({ enum: ApprovalAction, description: 'Action to take: APPROVE or REJECT' })
    @IsEnum(ApprovalAction)
    @IsNotEmpty()
    action: ApprovalAction;

    @ApiProperty({ example: 'Approved by Supervisor', description: 'Review notes', required: false })
    @IsOptional()
    @IsString()
    reviewNotes?: string;

    @ApiProperty({ example: 3, description: 'ID of the HR Admin to assign (Required for Supervisor approval)', required: false })
    @IsOptional()
    @IsInt()
    assignToHrId?: number;
}

import { Controller, Post, Body, UseGuards, Request, Put, Param } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { LeaveStatus } from '../../database/entities/leave.entity';

@Controller('absences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbsencesController {
    constructor(private readonly absencesService: AbsencesService) { }

    @Roles(UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Post('report')
    async reportAbsence(@Body() body: { employeeId: number; type: string; duration: number; date: string }) {
        return this.absencesService.reportAbsence(body.employeeId, body.type, body.duration, body.date);
    }

    @Roles(UserRole.EMPLOYEE)
    @Post('leave-request')
    async requestLeave(@Request() req: any, @Body() body: { type: string; startDate: string; endDate: string; reason: string }) {
        return this.absencesService.requestLeave(req.user.id, body.type, body.startDate, body.endDate, body.reason);
    }

    @Roles(UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Put('validate-leave/:id')
    async validateLeave(@Param('id') id: number, @Body() body: { status: LeaveStatus }) {
        return this.absencesService.validateLeave(id, body.status);
    }
}

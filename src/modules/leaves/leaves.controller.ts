import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    ForbiddenException,
    ParseIntPipe,
    Ip,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { LeavesService } from './leaves.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('leaves')
@ApiBearerAuth()
@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeavesController {
    constructor(
        private readonly leavesService: LeavesService,
        private readonly auditService: AuditService,
    ) {}

    // ── Reference data ──────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Get available leave types' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('types')
    async getLeaveTypes() {
        return this.leavesService.getLeaveTypes();
    }

    // ── Employee ─────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Submit a new leave request' })
    @ApiResponse({ status: 201, description: 'Leave request created successfully' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Post()
    async createLeaveRequest(@Request() req: any, @Body() dto: CreateLeaveRequestDto) {
        return this.leavesService.createLeaveRequest(req.user.id, dto);
    }

    @ApiOperation({ summary: 'Get my leave requests' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('my-requests')
    async getMyRequests(@Request() req: any, @Query() query: QueryLeaveRequestsDto) {
        return this.leavesService.getMyLeaveRequests(req.user.id, query);
    }

    // ── Supervisor ────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Get leave requests assigned to me for supervisor validation' })
    @Roles(UserRole.SUPERVISOR)
    @Get('supervisor')
    async getSupervisorRequests(@Request() req: any) {
        return this.leavesService.getSupervisorRequests(req.user.id);
    }

    @ApiOperation({ summary: 'Supervisor decision: approve or reject a leave request' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                action:  { type: 'string', enum: ['APPROVE', 'REJECT'] },
                comment: { type: 'string' },
            },
            required: ['action'],
        },
    })
    @Roles(UserRole.SUPERVISOR)
    @Patch(':id/supervisor-decision')
    async supervisorDecision(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() body: { action: 'APPROVE' | 'REJECT'; comment?: string },
        @Ip() ip: string,
    ) {
        let result: any;
        if (body.action === 'APPROVE') {
            result = await this.leavesService.approveBySupervisor(id, req.user.id, body.comment);
        } else {
            result = await this.leavesService.rejectBySupervisor(id, req.user.id, body.comment);
        }

        await this.auditService.log(
            req.user.id,
            body.action === 'APPROVE' ? 'APPROVE_LEAVE_SUPERVISOR' : 'REJECT_LEAVE_SUPERVISOR',
            id,
            'LeaveRequest',
            { action: body.action, comment: body.comment },
            ip,
            { matricule: req.user.matricule, role: req.user.role },
        );
        return result;
    }

    @ApiOperation({ summary: 'Get pending leave requests for supervisor (legacy)' })
    @Roles(UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('pending')
    async getPendingRequests(@Request() req: any) {
        const supervisorId = req.user.role === UserRole.SUPERVISOR ? req.user.id : undefined;
        return this.leavesService.getPendingRequests(supervisorId);
    }

    @ApiOperation({ summary: 'Get team leave requests (all statuses)' })
    @Roles(UserRole.SUPERVISOR)
    @Get('team')
    async getTeamRequests(@Request() req: any, @Query() query: QueryLeaveRequestsDto) {
        return this.leavesService.getTeamLeaveRequests(req.user.id, query);
    }

    // ── HR Admin ──────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Get leave requests approved by supervisor assigned to me' })
    @Roles(UserRole.HR_ADMIN)
    @Get('hr')
    async getHrRequests(@Request() req: any) {
        return this.leavesService.getHrRequests(req.user.id);
    }

    @ApiOperation({ summary: 'HR final decision: approve or reject a leave request' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                action:  { type: 'string', enum: ['APPROVE', 'REJECT'] },
                comment: { type: 'string' },
            },
            required: ['action'],
        },
    })
    @Roles(UserRole.HR_ADMIN)
    @Patch(':id/hr-decision')
    async hrDecision(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() body: { action: 'APPROVE' | 'REJECT'; comment?: string },
        @Ip() ip: string,
    ) {
        let result: any;
        if (body.action === 'APPROVE') {
            result = await this.leavesService.approveByHr(id, req.user.id, body.comment);
        } else {
            result = await this.leavesService.rejectByHr(id, req.user.id, body.comment);
        }

        await this.auditService.log(
            req.user.id,
            body.action === 'APPROVE' ? 'APPROVE_LEAVE_HR' : 'REJECT_LEAVE_HR',
            id,
            'LeaveRequest',
            { action: body.action, comment: body.comment },
            ip,
            { matricule: req.user.matricule, role: req.user.role },
        );
        return result;
    }

    @ApiOperation({ summary: 'Get all leave requests (HR admin)' })
    @Roles(UserRole.HR_ADMIN)
    @Get('all')
    async getAllRequests(@Query() query: QueryLeaveRequestsDto) {
        return this.leavesService.getAllLeaveRequests(query);
    }

    // ── Generic reject (legacy endpoint) ────────────────────────────────────

    @ApiOperation({ summary: 'Reject a leave request (legacy)' })
    @Roles(UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Patch(':id/reject')
    async rejectRequest(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() dto: UpdateLeaveStatusDto,
        @Ip() ip: string,
    ) {
        const result = await this.leavesService.rejectLeaveRequest(id, req.user.id, dto);

        await this.auditService.log(
            req.user.id,
            'REJECT_LEAVE',
            id,
            'LeaveRequest',
            { reason: dto.reviewNotes },
            ip,
            { matricule: req.user.matricule, role: req.user.role },
        );
        return result;
    }

    // ── Old supervisor/HR approve endpoints (kept for backward compat) ───────

    @ApiOperation({ summary: 'Approve leave request by supervisor (legacy)' })
    @Roles(UserRole.SUPERVISOR)
    @Patch(':id/approve/supervisor')
    async approveBySupervisorLegacy(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() dto: { reviewNotes?: string },
        @Ip() ip: string,
    ) {
        const result = await this.leavesService.approveBySupervisor(id, req.user.id, dto.reviewNotes);
        await this.auditService.log(req.user.id, 'APPROVE_LEAVE_SUPERVISOR', id, 'LeaveRequest', { reviewNotes: dto.reviewNotes }, ip, { matricule: req.user.matricule, role: req.user.role });
        return result;
    }

    @ApiOperation({ summary: 'Approve leave request by HR (legacy)' })
    @Roles(UserRole.HR_ADMIN)
    @Patch(':id/approve/hr')
    async approveByHrLegacy(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() dto: { reviewNotes?: string },
        @Ip() ip: string,
    ) {
        const result = await this.leavesService.approveByHr(id, req.user.id, dto.reviewNotes);
        await this.auditService.log(req.user.id, 'APPROVE_LEAVE_HR', id, 'LeaveRequest', { reviewNotes: dto.reviewNotes }, ip, { matricule: req.user.matricule, role: req.user.role });
        return result;
    }

    // ── Get single request (must be after named routes) ─────────────────────

    @ApiOperation({ summary: 'Get leave request by ID' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get(':id')
    async getLeaveRequest(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
        const leaveRequest = await this.leavesService.getLeaveRequestById(id);

        if (req.user.role === UserRole.EMPLOYEE && leaveRequest.employeeId !== req.user.id) {
            throw new ForbiddenException('You can only view your own leave requests');
        }

        if (req.user.role === UserRole.SUPERVISOR) {
            const canView = await this.leavesService.canReviewRequest(req.user.id, id);
            if (!canView && leaveRequest.employeeId !== req.user.id && leaveRequest.supervisorId !== req.user.id) {
                throw new ForbiddenException("You can only view your team members' leave requests");
            }
        }

        return leaveRequest;
    }
}

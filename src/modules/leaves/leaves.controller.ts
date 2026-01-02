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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { LeavesService } from './leaves.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';

@ApiTags('leaves')
@ApiBearerAuth()
@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeavesController {
    constructor(private readonly leavesService: LeavesService) { }

    @ApiOperation({ summary: 'Get available leave types' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('types')
    async getLeaveTypes() {
        return this.leavesService.getLeaveTypes();
    }

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

    @ApiOperation({ summary: 'Get pending leave requests (for supervisors and HR)' })
    @Roles(UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('pending')
    async getPendingRequests(@Request() req: any) {
        // Supervisors see only their team's pending requests
        // HR sees all pending requests
        const supervisorId = req.user.role === UserRole.SUPERVISOR ? req.user.id : undefined;
        return this.leavesService.getPendingRequests(supervisorId);
    }

    @ApiOperation({ summary: 'Get team leave requests (for supervisors)' })
    @Roles(UserRole.SUPERVISOR)
    @Get('team')
    async getTeamRequests(@Request() req: any, @Query() query: QueryLeaveRequestsDto) {
        return this.leavesService.getTeamLeaveRequests(req.user.id, query);
    }

    @ApiOperation({ summary: 'Get all leave requests (for HR)' })
    @Roles(UserRole.HR_ADMIN)
    @Get('all')
    async getAllRequests(@Query() query: QueryLeaveRequestsDto) {
        return this.leavesService.getAllLeaveRequests(query);
    }

    @ApiOperation({ summary: 'Get leave request by ID' })
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get(':id')
    async getLeaveRequest(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
        const leaveRequest = await this.leavesService.getLeaveRequestById(id);

        // Employees can only view their own requests
        if (req.user.role === UserRole.EMPLOYEE && leaveRequest.employeeId !== req.user.id) {
            throw new ForbiddenException('You can only view your own leave requests');
        }

        // Supervisors can view their team's requests
        if (req.user.role === UserRole.SUPERVISOR) {
            const canView = await this.leavesService.canReviewRequest(req.user.id, id);
            if (!canView && leaveRequest.employeeId !== req.user.id) {
                throw new ForbiddenException('You can only view your team members\' leave requests');
            }
        }

        return leaveRequest;
    }

    /*
    @ApiOperation({ summary: 'Approve leave request (Supervisor Step)' })
    @ApiResponse({ status: 200, description: 'Leave request approved by supervisor' })
    @Roles(UserRole.SUPERVISOR)
    @Patch(':id/approve/supervisor')
    async approveBySupervisor(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() dto: ApproveLeaveRequestDto, // We will use a separate DTO or reuse carefully
    ) {
         if (!dto.assignToHrId) {
             throw new ForbiddenException('HR Admin ID must be provided for supervisor approval');
         }
         return this.leavesService.approveBySupervisor(id, req.user.id, dto.assignToHrId, dto.reviewNotes);
    }

    @ApiOperation({ summary: 'Approve leave request (HR Step)' })
    @ApiResponse({ status: 200, description: 'Leave request finalized by HR' })
    @Roles(UserRole.HR_ADMIN)
    @Patch(':id/approve/hr')
    async approveByHr(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() dto: ApproveLeaveRequestDto,
    ) {
         return this.leavesService.approveByHr(id, req.user.id, dto.reviewNotes);
    }
    
    @ApiOperation({ summary: 'Reject a leave request' })
    @ApiResponse({ status: 200, description: 'Leave request rejected successfully' })
    @Roles(UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Patch(':id/reject')
    async rejectRequest(
        @Param('id', ParseIntPipe) id: number,
        @Request() req: any,
        @Body() dto: UpdateLeaveStatusDto,
    ) {
         return this.leavesService.rejectLeaveRequest(id, req.user.id, dto);
    }
    */
}

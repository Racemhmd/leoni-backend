import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { LeaveRequest, LeaveStatus, LeaveType } from '../../database/entities/leave.entity';
import { User } from '../../database/entities/user.entity'; // Assuming User entity path
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { LtgIntegrationService } from './ltg-integration.service';
import { NotificationType } from '../../database/entities/notification.entity';
// ... (imports)

@Injectable()
export class LeavesService {
    constructor(
        @InjectRepository(LeaveRequest)
        private leaveRequestRepository: Repository<LeaveRequest>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private notificationsService: NotificationsService,
        private ltgService: LtgIntegrationService,
    ) { }

    async getLeaveTypes() {
        return [
            { code: LeaveType.ANNUAL_LEAVE, label: 'Congé Annuel', requiresBalance: true },
            { code: LeaveType.AUTHORIZED_ABSENCE, label: 'Absence Autorisée (AA)', requiresBalance: false },
            { code: LeaveType.INSUFFICIENT_BALANCE, label: 'Congé avec Solde Insuffisant', requiresBalance: false },
        ];
    }

    async getMyLeaveRequests(employeeId: number, query: QueryLeaveRequestsDto): Promise<LeaveRequest[]> {
        const where: any = { employeeId };

        if (query.status) {
            where.status = query.status;
        }

        if (query.startDate && query.endDate) {
            where.startDate = Between(new Date(query.startDate), new Date(query.endDate));
        } else if (query.startDate) {
            where.startDate = MoreThanOrEqual(new Date(query.startDate));
        } else if (query.endDate) {
            where.endDate = LessThanOrEqual(new Date(query.endDate));
        }

        const requests = await this.leaveRequestRepository.find({
            where,
            order: { createdAt: 'DESC' },
            relations: ['reviewer'],
        });

        // Sync with LTG for pending requests
        for (const req of requests) {
            const pendingStatuses = [
                LeaveStatus.PENDING_LTG,
                LeaveStatus.PENDING_SUPERVISOR,
                LeaveStatus.APPROVED_SUPERVISOR,
                LeaveStatus.PENDING_HR,
                LeaveStatus.APPROVED_HR
            ];

            if (pendingStatuses.includes(req.status)) {
                const newStatus = await this.ltgService.pollLtgStatus(req.id);
                if (newStatus !== req.status) {
                    req.status = newStatus;
                    await this.leaveRequestRepository.save(req);
                }
            }
        }

        return requests;
    }

    async getPendingRequests(supervisorId?: number): Promise<LeaveRequest[]> {
        const queryBuilder = this.leaveRequestRepository
            .createQueryBuilder('leave')
            .leftJoinAndSelect('leave.employee', 'employee')
            .leftJoinAndSelect('employee.supervisor', 'supervisor')
            // Show requests pending supervisor if I am the supervisor
            .where('leave.status = :status', { status: supervisorId ? LeaveStatus.PENDING_SUPERVISOR : LeaveStatus.PENDING_HR });

        if (supervisorId) {
            queryBuilder.andWhere('supervisor.id = :supervisorId', { supervisorId });
        }

        return queryBuilder.orderBy('leave.createdAt', 'ASC').getMany();
    }

    async getTeamLeaveRequests(supervisorId: number, query: QueryLeaveRequestsDto): Promise<LeaveRequest[]> {
        const queryBuilder = this.leaveRequestRepository
            .createQueryBuilder('leave')
            .leftJoinAndSelect('leave.employee', 'employee')
            .leftJoinAndSelect('employee.supervisor', 'supervisor')
            .leftJoinAndSelect('leave.reviewer', 'reviewer')
            .where('supervisor.id = :supervisorId', { supervisorId });

        if (query.status) {
            queryBuilder.andWhere('leave.status = :status', { status: query.status });
        }

        if (query.employeeId) {
            queryBuilder.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
        }

        return queryBuilder.orderBy('leave.createdAt', 'DESC').getMany();
    }

    async getAllLeaveRequests(query: QueryLeaveRequestsDto): Promise<LeaveRequest[]> {
        const where: any = {};

        if (query.status) {
            where.status = query.status;
        }

        if (query.employeeId) {
            where.employeeId = query.employeeId;
        }

        return this.leaveRequestRepository.find({
            where,
            order: { createdAt: 'DESC' },
            relations: ['employee', 'reviewer'],
        });
    }

    async getLeaveRequestById(id: number): Promise<LeaveRequest> {
        const leaveRequest = await this.leaveRequestRepository.findOne({
            where: { id },
            relations: ['employee', 'reviewer', 'supervisor'],
        });

        if (!leaveRequest) {
            throw new NotFoundException('Leave request not found');
        }

        return leaveRequest;
    }

    async createLeaveRequest(employeeId: number, dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
        // Validate dates
        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);

        if (endDate < startDate) {
            throw new BadRequestException('End date must be after or equal to start date');
        }

        // Calculate days
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        // Check for overlapping leave requests
        const hasOverlap = await this.checkOverlappingLeaves(employeeId, startDate, endDate);
        if (hasOverlap) {
            throw new BadRequestException('You already have a leave request for this period');
        }

        // Validate Leave Type and Balance
        if (dto.leaveType === LeaveType.ANNUAL_LEAVE) {
            const user = await this.userRepository.findOne({ where: { id: employeeId } });
            if (!user) throw new BadRequestException('User not found');

            if (user.leaveBalance < days) {
                throw new BadRequestException(`Insufficient leave balance for Annual Leave. Balance: ${user.leaveBalance}, Requested: ${days}`);
            }
        }

        // Validate Supervisor existence and Role
        const supervisor = await this.userRepository.findOne({ where: { id: dto.supervisorId }, relations: ['role'] });
        if (!supervisor) {
            throw new BadRequestException('Selected supervisor not found');
        }
        if (supervisor.role?.name !== 'SUPERVISOR') {
            throw new BadRequestException('Selected user is not a Supervisor');
        }
        if (supervisor.id === employeeId) {
            throw new BadRequestException('You cannot select yourself as Supervisor');
        }

        // Validate HR Admin existence and Role
        const hrAdmin = await this.userRepository.findOne({ where: { id: dto.hrAdminId }, relations: ['role'] });
        if (!hrAdmin) {
            throw new BadRequestException('Selected HR Admin not found');
        }
        if (hrAdmin.role?.name !== 'HR_ADMIN') {
            throw new BadRequestException('Selected user is not an HR Admin');
        }
        if (hrAdmin.id === employeeId) {
            throw new BadRequestException('You cannot select yourself as HR Admin');
        }

        // Create leave request
        const leaveRequest = this.leaveRequestRepository.create({
            employeeId,
            leaveType: dto.leaveType,
            startDate,
            endDate,
            reason: dto.reason,
            supervisorId: dto.supervisorId,
            hrAdminId: dto.hrAdminId, // Added
            status: LeaveStatus.PENDING_LTG, // Skip internal steps for now
        });

        const saved = await this.leaveRequestRepository.save(leaveRequest);

        // Submit to LTG immediately as per new requirement
        try {
            await this.ltgService.submitToLtg(saved);
        } catch (e) {
            console.error('LTG Submit failed', e);
            // We might want to rollback or mark as failed, but for now we keep it PENDING_LTG to retry?
        }

        /* 
        // Internal notification logic - Disabled as process happens in LTG
        await this.notificationsService.createNotification({
            employeeId: dto.supervisorId,
            title: 'New Leave Request',
            message: `New request submitted to LTG.`,
            type: NotificationType.INFO,
        });
        */

        return saved;
    }

    async approveBySupervisor(requestId: number, supervisorId: number, assignToHrId: number, notes?: string): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.status !== LeaveStatus.PENDING_SUPERVISOR) {
            throw new BadRequestException('Request is not in Pending Supervisor state');
        }
        if (leave.supervisorId !== supervisorId) {
            throw new ForbiddenException('You are not the assigned supervisor for this request');
        }

        const hrAdmin = await this.userRepository.findOne({ where: { id: assignToHrId } });
        if (!hrAdmin) throw new BadRequestException('Selected HR Admin not found');
        // Check if role is HR_ADMIN if possible

        leave.status = LeaveStatus.PENDING_HR;
        leave.hrAdminId = assignToHrId;
        leave.reviewedBy = supervisorId; // Traceability
        leave.reviewedAt = new Date();
        if (notes) leave.reviewNotes = notes;

        const saved = await this.leaveRequestRepository.save(leave);

        // Notify HR
        await this.notificationsService.createNotification({
            employeeId: assignToHrId,
            title: 'Leave Request Pending HR Approval',
            message: `A leave request (approved by supervisor) needs your validation.`,
            type: NotificationType.INFO,
        });

        return saved;
    }

    async approveByHr(requestId: number, hrId: number, notes?: string): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.status !== LeaveStatus.PENDING_HR) {
            throw new BadRequestException('Request is not in Pending HR state');
        }
        if (leave.hrAdminId !== hrId) {
            // In some models, any HR can approve, but here we enforce the assigned one for strict workflow
            throw new ForbiddenException('You are not the assigned HR Admin for this request');
        }

        leave.status = LeaveStatus.PENDING_LTG;
        leave.reviewedBy = hrId; // Trace
        leave.reviewedAt = new Date();
        if (notes) leave.reviewNotes = notes;

        const saved = await this.leaveRequestRepository.save(leave);

        // Submit to LTG
        try {
            await this.ltgService.submitToLtg(saved);
        } catch (e) {
            console.error('LTG Submit failed', e);
        }

        return saved;
    }

    async rejectLeaveRequest(
        requestId: number,
        reviewerId: number,
        dto: UpdateLeaveStatusDto,
    ): Promise<LeaveRequest> {
        const leaveRequest = await this.getLeaveRequestById(requestId);

        // Can reject at any pending stage
        const isPending = [LeaveStatus.PENDING_SUPERVISOR, LeaveStatus.PENDING_HR].includes(leaveRequest.status as LeaveStatus);

        if (!isPending) {
            throw new BadRequestException('Request is not in a pending state');
        }

        // Prevent self-rejection
        if (leaveRequest.employeeId === reviewerId) {
            throw new ForbiddenException('You cannot reject your own leave request');
        }

        // Validate ownership/authorisation
        if (leaveRequest.status === LeaveStatus.PENDING_SUPERVISOR) {
            if (leaveRequest.supervisorId !== reviewerId) {
                throw new ForbiddenException('You are not the assigned supervisor for this request');
            }
        } else if (leaveRequest.status === LeaveStatus.PENDING_HR) {
            if (leaveRequest.hrAdminId !== reviewerId) {
                throw new ForbiddenException('You are not the assigned HR Admin for this request');
            }
        }

        // Update leave request
        leaveRequest.status = LeaveStatus.REJECTED;
        leaveRequest.reviewedBy = reviewerId;
        leaveRequest.reviewedAt = new Date();
        leaveRequest.reviewNotes = dto.reviewNotes || '';

        const updated = await this.leaveRequestRepository.save(leaveRequest);

        // Send notification to employee
        await this.notificationsService.createNotification({
            employeeId: leaveRequest.employeeId,
            title: 'Leave Request Rejected',
            message: `Your leave request has been rejected. Reason: ${dto.reviewNotes || 'No reason provided'}`,
            type: NotificationType.WARNING,
        });

        return updated;
    }

    async canReviewRequest(userId: number, requestId: number): Promise<boolean> {
        const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['role'] });
        if (!user) return false;

        const leaveRequest = await this.getLeaveRequestById(requestId);

        if (user.role?.name === 'HR_ADMIN' && leaveRequest.status === LeaveStatus.PENDING_HR) {
            return leaveRequest.hrAdminId === userId; // Enforce assignment
        }

        if (user.role?.name === 'SUPERVISOR' && leaveRequest.status === LeaveStatus.PENDING_SUPERVISOR) {
            return leaveRequest.supervisorId === userId;
        }

        return false;
    }

    private async checkOverlappingLeaves(
        employeeId: number,
        startDate: Date,
        endDate: Date,
        excludeId?: number,
    ): Promise<boolean> {
        const queryBuilder = this.leaveRequestRepository
            .createQueryBuilder('leave')
            .where('leave.employeeId = :employeeId', { employeeId })
            .andWhere('leave.status != :rejectedStatus', { rejectedStatus: LeaveStatus.REJECTED })
            .andWhere(
                '(leave.startDate BETWEEN :startDate AND :endDate OR leave.endDate BETWEEN :startDate AND :endDate OR (:startDate BETWEEN leave.startDate AND leave.endDate))',
                { startDate, endDate },
            );

        if (excludeId) {
            queryBuilder.andWhere('leave.id != :excludeId', { excludeId });
        }

        const count = await queryBuilder.getCount();
        return count > 0;
    }
}

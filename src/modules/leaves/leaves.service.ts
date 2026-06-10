import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { LeaveRequest, LeaveStatus, LeaveType } from '../../database/entities/leave.entity';
import { User } from '../../database/entities/user.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class LeavesService {
    constructor(
        @InjectRepository(LeaveRequest)
        private leaveRequestRepository: Repository<LeaveRequest>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private notificationsService: NotificationsService,
    ) {}

    // ── Reference data ──────────────────────────────────────────────────────

    async getLeaveTypes() {
        return [
            { code: LeaveType.ANNUAL_LEAVE,         label: 'Congé Annuel',                     requiresBalance: true  },
            { code: LeaveType.AUTHORIZED_ABSENCE,   label: 'Absence Autorisée (AA)',             requiresBalance: false },
            { code: LeaveType.INSUFFICIENT_BALANCE, label: 'Congé avec Solde Insuffisant',       requiresBalance: false },
        ];
    }

    // ── Employee: create request ─────────────────────────────────────────────

    async createLeaveRequest(employeeId: number, dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
        const startDate = new Date(dto.startDate);
        const endDate   = new Date(dto.endDate);

        if (endDate < startDate) {
            throw new BadRequestException('End date must be after or equal to start date');
        }

        const days = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        if (await this.checkOverlappingLeaves(employeeId, startDate, endDate)) {
            throw new BadRequestException('You already have a leave request for this period');
        }

        if (dto.leaveType === LeaveType.ANNUAL_LEAVE) {
            const user = await this.userRepository.findOne({ where: { id: employeeId } });
            if (!user) throw new BadRequestException('User not found');
            if (user.leaveBalance < days) {
                throw new BadRequestException(
                    `Solde insuffisant. Disponible : ${user.leaveBalance} j, demandé : ${days} j`,
                );
            }
        }

        // Validate supervisor
        const supervisor = await this.userRepository.findOne({
            where: { id: dto.supervisorId },
            relations: ['role'],
        });
        if (!supervisor) throw new BadRequestException('Superviseur introuvable');
        if (supervisor.role?.name !== 'SUPERVISOR') throw new BadRequestException('L\'utilisateur sélectionné n\'est pas superviseur');
        if (supervisor.id === employeeId) throw new BadRequestException('Vous ne pouvez pas vous désigner vous-même');

        // Validate HR admin
        const hrAdmin = await this.userRepository.findOne({
            where: { id: dto.hrAdminId },
            relations: ['role'],
        });
        if (!hrAdmin) throw new BadRequestException('Administrateur RH introuvable');
        if (hrAdmin.role?.name !== 'HR_ADMIN') throw new BadRequestException('L\'utilisateur sélectionné n\'est pas un Admin RH');
        if (hrAdmin.id === employeeId) throw new BadRequestException('Vous ne pouvez pas vous désigner vous-même');

        const leaveRequest = this.leaveRequestRepository.create({
            employeeId,
            leaveType:    dto.leaveType,
            startDate,
            endDate,
            reason:       dto.reason,
            supervisorId: dto.supervisorId,
            hrAdminId:    dto.hrAdminId,
            status:       LeaveStatus.PENDING_SUPERVISOR,
        });

        const saved = await this.leaveRequestRepository.save(leaveRequest);

        // Notify selected supervisor
        await this.notificationsService.createNotification({
            employeeId: dto.supervisorId,
            title:   'Nouvelle demande de congé',
            message: `Une demande de congé vous a été assignée pour validation.`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        // Notify employee that submission was successful
        await this.notificationsService.createNotification({
            employeeId,
            title:   'Demande soumise',
            message: `Votre demande de congé a été soumise et attend la validation de votre superviseur.`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        return saved;
    }

    // ── Employee: my requests ────────────────────────────────────────────────

    async getMyLeaveRequests(employeeId: number, query: QueryLeaveRequestsDto): Promise<LeaveRequest[]> {
        const where: any = { employeeId };
        if (query.status)    where.status    = query.status;
        if (query.startDate && query.endDate) {
            where.startDate = Between(new Date(query.startDate), new Date(query.endDate));
        } else if (query.startDate) {
            where.startDate = MoreThanOrEqual(new Date(query.startDate));
        } else if (query.endDate) {
            where.endDate   = LessThanOrEqual(new Date(query.endDate));
        }

        return this.leaveRequestRepository.find({
            where,
            order: { createdAt: 'DESC' },
            relations: ['supervisor', 'hrAdmin'],
        });
    }

    // ── Supervisor: pending requests assigned to them ────────────────────────

    async getSupervisorRequests(supervisorId: number): Promise<LeaveRequest[]> {
        return this.leaveRequestRepository.find({
            where: { supervisorId, status: LeaveStatus.PENDING_SUPERVISOR },
            order: { createdAt: 'ASC' },
            relations: ['employee'],
        });
    }

    // ── HR Admin: requests approved by supervisor assigned to them ───────────

    async getHrRequests(hrAdminId: number): Promise<LeaveRequest[]> {
        return this.leaveRequestRepository.find({
            where: { hrAdminId, status: LeaveStatus.APPROVED_BY_SUPERVISOR },
            order: { supervisorDecisionAt: 'DESC' },
            relations: ['employee', 'supervisor'],
        });
    }

    // ── Legacy: pending list (kept for admin KPI count) ──────────────────────

    async getPendingRequests(supervisorId?: number): Promise<LeaveRequest[]> {
        if (supervisorId) {
            return this.getSupervisorRequests(supervisorId);
        }
        // HR_ADMIN: show all requests awaiting HR decision
        return this.leaveRequestRepository.find({
            where: { status: LeaveStatus.APPROVED_BY_SUPERVISOR },
            order: { createdAt: 'ASC' },
            relations: ['employee', 'supervisor'],
        });
    }

    async getTeamLeaveRequests(supervisorId: number, query: QueryLeaveRequestsDto): Promise<LeaveRequest[]> {
        const qb = this.leaveRequestRepository
            .createQueryBuilder('leave')
            .leftJoinAndSelect('leave.employee', 'employee')
            .where('leave.supervisorId = :supervisorId', { supervisorId });

        if (query.status) qb.andWhere('leave.status = :status', { status: query.status });
        return qb.orderBy('leave.createdAt', 'DESC').getMany();
    }

    async getAllLeaveRequests(query: QueryLeaveRequestsDto): Promise<LeaveRequest[]> {
        const where: any = {};
        if (query.status)     where.status     = query.status;
        if (query.employeeId) where.employeeId = query.employeeId;

        return this.leaveRequestRepository.find({
            where,
            order: { createdAt: 'DESC' },
            relations: ['employee', 'supervisor', 'hrAdmin'],
        });
    }

    async getLeaveRequestById(id: number): Promise<LeaveRequest> {
        const leave = await this.leaveRequestRepository.findOne({
            where: { id },
            relations: ['employee', 'supervisor', 'hrAdmin'],
        });
        if (!leave) throw new NotFoundException('Demande de congé introuvable');
        return leave;
    }

    // ── Supervisor: approve ──────────────────────────────────────────────────

    async approveBySupervisor(
        requestId:    number,
        supervisorId: number,
        comment?:     string,
    ): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.status !== LeaveStatus.PENDING_SUPERVISOR) {
            throw new BadRequestException('La demande n\'est pas en attente de validation superviseur');
        }
        if (leave.supervisorId !== supervisorId) {
            throw new ForbiddenException('Vous n\'êtes pas le superviseur assigné à cette demande');
        }

        leave.status               = LeaveStatus.APPROVED_BY_SUPERVISOR;
        leave.supervisorDecisionAt = new Date();
        leave.supervisorComment    = comment ?? null;
        leave.reviewedBy           = supervisorId;
        leave.reviewedAt           = new Date();

        const saved = await this.leaveRequestRepository.save(leave);

        // Notify assigned HR admin
        await this.notificationsService.createNotification({
            employeeId: leave.hrAdminId,
            title:   'Demande de congé à valider',
            message: `Une demande de congé approuvée par le superviseur attend votre validation finale.`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        // Notify employee
        await this.notificationsService.createNotification({
            employeeId: leave.employeeId,
            title:   'Congé approuvé par le superviseur',
            message: `Votre demande de congé a été approuvée par votre superviseur. Elle est maintenant en attente de la validation RH.`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        return saved;
    }

    // ── Supervisor: reject ───────────────────────────────────────────────────

    async rejectBySupervisor(
        requestId:    number,
        supervisorId: number,
        comment?:     string,
    ): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.status !== LeaveStatus.PENDING_SUPERVISOR) {
            throw new BadRequestException('La demande n\'est pas en attente de validation superviseur');
        }
        if (leave.supervisorId !== supervisorId) {
            throw new ForbiddenException('Vous n\'êtes pas le superviseur assigné à cette demande');
        }

        leave.status               = LeaveStatus.REJECTED_BY_SUPERVISOR;
        leave.supervisorDecisionAt = new Date();
        leave.supervisorComment    = comment ?? null;
        leave.reviewedBy           = supervisorId;
        leave.reviewedAt           = new Date();

        const saved = await this.leaveRequestRepository.save(leave);

        // Notify employee
        await this.notificationsService.createNotification({
            employeeId: leave.employeeId,
            title:   'Congé refusé',
            message: `Votre demande de congé a été refusée par votre superviseur.${comment ? ' Motif : ' + comment : ''}`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        return saved;
    }

    // ── HR Admin: final approve ──────────────────────────────────────────────

    async approveByHr(
        requestId: number,
        hrId:      number,
        comment?:  string,
    ): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.status !== LeaveStatus.APPROVED_BY_SUPERVISOR) {
            throw new BadRequestException('La demande n\'a pas encore été approuvée par le superviseur');
        }
        if (leave.hrAdminId !== hrId) {
            throw new ForbiddenException('Vous n\'êtes pas l\'administrateur RH assigné à cette demande');
        }

        leave.status       = LeaveStatus.APPROVED_BY_HR;
        leave.hrDecisionAt = new Date();
        leave.hrComment    = comment ?? null;
        leave.reviewedBy   = hrId;
        leave.reviewedAt   = new Date();

        const saved = await this.leaveRequestRepository.save(leave);

        // Notify employee
        await this.notificationsService.createNotification({
            employeeId: leave.employeeId,
            title:   'Congé définitivement approuvé',
            message: `Votre demande de congé a été approuvée par l'Administration RH.`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        // Optionally notify supervisor
        if (leave.supervisorId) {
            await this.notificationsService.createNotification({
                employeeId: leave.supervisorId,
                title:   'Congé validé par RH',
                message: `La demande de congé que vous avez approuvée a été définitivement validée par l'Administration RH.`,
                type:    NotificationType.LEAVE_UPDATE,
            });
        }

        return saved;
    }

    // ── HR Admin: final reject ───────────────────────────────────────────────

    async rejectByHr(
        requestId: number,
        hrId:      number,
        comment?:  string,
    ): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.status !== LeaveStatus.APPROVED_BY_SUPERVISOR) {
            throw new BadRequestException('La demande n\'a pas encore été approuvée par le superviseur');
        }
        if (leave.hrAdminId !== hrId) {
            throw new ForbiddenException('Vous n\'êtes pas l\'administrateur RH assigné à cette demande');
        }

        leave.status       = LeaveStatus.REJECTED_BY_HR;
        leave.hrDecisionAt = new Date();
        leave.hrComment    = comment ?? null;
        leave.reviewedBy   = hrId;
        leave.reviewedAt   = new Date();

        const saved = await this.leaveRequestRepository.save(leave);

        // Notify employee
        await this.notificationsService.createNotification({
            employeeId: leave.employeeId,
            title:   'Congé refusé par RH',
            message: `Votre demande de congé a été refusée par l'Administration RH.${comment ? ' Motif : ' + comment : ''}`,
            type:    NotificationType.LEAVE_UPDATE,
        });

        return saved;
    }

    // ── Legacy reject (kept for existing endpoint compatibility) ─────────────

    async rejectLeaveRequest(
        requestId:  number,
        reviewerId: number,
        dto:        UpdateLeaveStatusDto,
    ): Promise<LeaveRequest> {
        const leave = await this.getLeaveRequestById(requestId);

        if (leave.employeeId === reviewerId) {
            throw new ForbiddenException('Vous ne pouvez pas rejeter votre propre demande');
        }

        if (leave.status === LeaveStatus.PENDING_SUPERVISOR) {
            return this.rejectBySupervisor(requestId, reviewerId, dto.reviewNotes);
        }
        if (leave.status === LeaveStatus.APPROVED_BY_SUPERVISOR) {
            return this.rejectByHr(requestId, reviewerId, dto.reviewNotes);
        }

        throw new BadRequestException('La demande n\'est pas dans un état rejetable');
    }

    async canReviewRequest(userId: number, requestId: number): Promise<boolean> {
        const leave = await this.getLeaveRequestById(requestId);
        if (leave.supervisorId === userId && leave.status === LeaveStatus.PENDING_SUPERVISOR)      return true;
        if (leave.hrAdminId    === userId && leave.status === LeaveStatus.APPROVED_BY_SUPERVISOR)  return true;
        return false;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private async checkOverlappingLeaves(
        employeeId: number,
        startDate:  Date,
        endDate:    Date,
        excludeId?: number,
    ): Promise<boolean> {
        const qb = this.leaveRequestRepository
            .createQueryBuilder('leave')
            .where('leave.employeeId = :employeeId', { employeeId })
            .andWhere('leave.status NOT IN (:...rejected)', {
                rejected: [
                    LeaveStatus.REJECTED_BY_SUPERVISOR,
                    LeaveStatus.REJECTED_BY_HR,
                ],
            })
            .andWhere(
                '(leave.startDate BETWEEN :startDate AND :endDate ' +
                'OR leave.endDate BETWEEN :startDate AND :endDate ' +
                'OR (:startDate BETWEEN leave.startDate AND leave.endDate))',
                { startDate, endDate },
            );

        if (excludeId) qb.andWhere('leave.id != :excludeId', { excludeId });

        return (await qb.getCount()) > 0;
    }
}

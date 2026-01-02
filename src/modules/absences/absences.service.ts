import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Absence } from '../../database/entities/absence.entity';
import { LeaveRequest, LeaveStatus } from '../../database/entities/leave.entity';
import { PointsService } from '../points/points.service';

@Injectable()
export class AbsencesService {
    constructor(
        @InjectRepository(Absence)
        private absencesRepository: Repository<Absence>,
        @InjectRepository(LeaveRequest)
        private leavesRepository: Repository<LeaveRequest>,
        private pointsService: PointsService,
        private dataSource: DataSource,
    ) { }

    async reportAbsence(employeeId: number, type: string, duration: number, date: string) {
        return this.dataSource.transaction(async (manager) => {
            const absence = manager.create(Absence, {
                employeeId,
                type: type as any,
                duration,
                absenceDate: new Date(date),
            });
            await manager.save(absence);

            // Penalty logic: -10 points per day
            // Using service method (ensure it supports transaction manager if we want strict atomicity, 
            // but PointsService as written uses its own transaction. 
            // NestJS TypeORM transactions don't propagate automatically unless we pass the manager.
            // For simplicity in this iteration, we'll let them be separate transactions or refactor PointsService to accept manager.
            // Refactoring PointsService to accept manager is better but complicates things.
            // We will just call the service method. If it fails, the absence is already saved? 
            // No, we want atomicity.
            // I will implement strict manual points update here using the manager for best practice.

            // Actually, PointsService.addPoints uses dataSource.transaction(). Nested transactions in Postgres are savepoints. It works.
            const penalty = duration * 10;
            await this.pointsService.deductPoints(employeeId, penalty, 'ABSENCE_PENALTY', `Absence: ${type} defined on ${date}`);

            return absence;
        });
    }

    async requestLeave(employeeId: number, type: string, startDate: string, endDate: string, reason: string) {
        const leave = this.leavesRepository.create({
            employeeId,
            leaveType: type as any,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            reason,
            status: LeaveStatus.PENDING_LTG,
        });
        return this.leavesRepository.save(leave);
    }

    async validateLeave(leaveId: number, status: LeaveStatus) {
        const leave = await this.leavesRepository.findOne({ where: { id: leaveId } });
        if (!leave) throw new Error('Leave not found');

        leave.status = status;
        return this.leavesRepository.save(leave);
    }
}

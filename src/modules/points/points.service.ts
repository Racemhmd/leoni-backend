import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Between } from 'typeorm';
import { PointTransaction, TransactionType, PointReason } from '../../database/entities/point-transaction.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PointsService {
    // Constants for Business Rules
    private readonly MAX_YEARLY_GAINED = 42;
    private readonly MAX_YEARLY_LOST = 21;
    private readonly POINT_TO_DT_RATE = 10;

    constructor(
        @InjectRepository(PointTransaction)
        private pointsRepo: Repository<PointTransaction>,
        @InjectRepository(User)
        private usersRepo: Repository<User>,
        private dataSource: DataSource,
        private notificationsService: NotificationsService,
        private auditService: AuditService,
    ) { }

    async getBalance(userId: number): Promise<number> {
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        return user ? Number(user.pointsBalance) : 0;
    }

    async getSummary(userId: number) {
        const balance = await this.getBalance(userId);
        const stats = await this.getYearlyStats(userId);

        return {
            balance: Number(balance.toFixed(2)),
            totalGainedYearly: Number(stats.gained.toFixed(2)),
            totalLostYearly: Number(stats.lost.toFixed(2)),
            dtValue: Number((balance * this.POINT_TO_DT_RATE).toFixed(3)), // 3 decimals for currency
            maxGained: this.MAX_YEARLY_GAINED,
            maxLost: this.MAX_YEARLY_LOST
        };
    }

    async getHistory(userId: number, filter: 'week' | 'month' | 'year' = 'month') {
        const query = this.pointsRepo.createQueryBuilder('pt')
            .where('pt.employeeId = :userId', { userId })
            .orderBy('pt.createdAt', 'DESC');

        const now = new Date();
        let startDate = new Date();

        if (filter === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (filter === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        } else if (filter === 'year') {
            startDate.setFullYear(now.getFullYear() - 1);
        }

        query.andWhere('pt.createdAt >= :startDate', { startDate });

        return query.getMany();
    }

    // --- Core Logic: Add Points ---
    async getTotalPointsDistributed(): Promise<number> {
        const result = await this.pointsRepo
            .createQueryBuilder('transaction')
            .select('SUM(transaction.value)', 'total')
            .where('transaction.type = :type', { type: TransactionType.EARNED })
            .getRawOne();
        return result ? parseFloat(result.total) || 0 : 0;
    }

    async addPoints(
        userId: number,
        amount: number,
        reason: PointReason,
        description: string,
        authorId?: number
    ) {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id: userId } });
            if (!user) throw new BadRequestException('User not found');

            // Check Role
            if (!this.canHavePoints(user)) {
                throw new BadRequestException('User role cannot have points');
            }

            // Check Yearly Cap
            const stats = await this.getYearlyStats(userId, manager);
            if (stats.gained + amount > this.MAX_YEARLY_GAINED) {
                throw new BadRequestException(`Cannot add points. Yearly limit (${this.MAX_YEARLY_GAINED}) would be exceeded. Current gained: ${stats.gained}`);
            }

            // Create Transaction
            const transaction = manager.create(PointTransaction, {
                employeeId: userId,
                type: TransactionType.EARNED,
                reason,
                value: amount,
                description,
            });
            await manager.save(transaction);

            // Update Balance
            // Handle decimal precision by using float addition then rounding if needed, 
            // but JS number is double precision so handled okay for this scale.
            await manager.increment(User, { id: userId }, 'pointsBalance', amount);

            // Notify
            const formattedReason = reason.replace(/_/g, ' ').toLowerCase();
            const titleReason = formattedReason.charAt(0).toUpperCase() + formattedReason.slice(1);
            const newBalance = (Number(user.pointsBalance) + amount).toFixed(1);

            await this.notificationsService.createNotification({
                employeeId: userId,
                title: 'Points Awarded',
                message: `You earned +${amount} points for ${titleReason}. Your current balance is now ${newBalance} points.`,
                type: NotificationType.POINT_GAIN
            });

            // Audit
            if (authorId) {
                await this.auditService.log(
                    authorId,
                    'ADD_POINTS',
                    userId,
                    'User',
                    { message: `Added ${amount} points. Reason: ${reason}. Description: ${description}` }
                );
            }

            return transaction;
        });
    }

    // --- Core Logic: Deduct Points ---
    async deductPoints(
        userId: number,
        amount: number,
        reason: PointReason,
        description: string,
        authorId?: number
    ) {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id: userId } });
            if (!user) throw new BadRequestException('User not found');

            // Check Role
            if (!this.canHavePoints(user)) {
                throw new BadRequestException('User role cannot have points');
            }

            // Check Balance Floor (Min 0)
            if (Number(user.pointsBalance) < amount) {
                throw new BadRequestException(`Insufficient points balance. Current: ${user.pointsBalance}, Required deduction: ${amount}`);
            }

            // Check Yearly Lost Cap
            // Only count "Penalties" towards the Lost Cap (e.g. Absence, Delay, Sanction).
            // Purchases (XMALL) or Liquidation usually shouldn't count towards "Max Points Lost" business rule 
            // which usually refers to *disciplinary* loss.
            // Assumption: The "Max 21 points lost" rule refers to PENALTIES.

            const isPenalty = [
                PointReason.UNPLANNED_ABSENCE,
                PointReason.DELAY,
                PointReason.DISCIPLINARY_SANCTION
            ].includes(reason);

            if (isPenalty) {
                const stats = await this.getYearlyStats(userId, manager);
                if (stats.lost + amount > this.MAX_YEARLY_LOST) {
                    throw new BadRequestException(`Cannot deduct points. Yearly penalty limit (${this.MAX_YEARLY_LOST}) would be exceeded. Current lost: ${stats.lost}`);
                }
            }

            // Create Transaction
            const transaction = manager.create(PointTransaction, {
                employeeId: userId,
                type: TransactionType.DEDUCTED,
                reason,
                value: amount, // Stored as positive value in 'value' column but type is DEDUCTED
                description,
            });
            await manager.save(transaction);

            // Update Balance
            await manager.decrement(User, { id: userId }, 'pointsBalance', amount);

            // Notify
            const formattedReason = reason.replace(/_/g, ' ').toLowerCase();
            const newBalance = (Number(user.pointsBalance) - amount).toFixed(1);

            await this.notificationsService.createNotification({
                employeeId: userId,
                title: 'Points Deducted',
                message: `You lost -${amount} points due to ${formattedReason}. Your current balance is now ${newBalance} points.`,
                type: NotificationType.POINT_LOSS
            });

            // Audit
            if (authorId) {
                await this.auditService.log(
                    authorId,
                    'DEDUCT_POINTS',
                    userId,
                    'User',
                    { message: `Deducted ${amount} points. Reason: ${reason}. Description: ${description}` }
                );
            }

            return transaction;
        });
    }

    private async getYearlyStats(userId: number, manager?: EntityManager) {
        const repo = manager ? manager.getRepository(PointTransaction) : this.pointsRepo;
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        const transactions = await repo.find({
            where: {
                employeeId: userId,
                createdAt: Between(startOfYear, endOfYear)
            }
        });

        // Sum Gained (EARNED type)
        // Sum Gained (EARNED type)
        const gained = transactions
            .filter(t => t.type === TransactionType.EARNED)
            .reduce((sum: number, t: PointTransaction) => sum + Number(t.value), 0);

        // Sum Lost (DEDUCTED type AND is Penalty)
        // We only count penalties towards the "Max 21 Lost" rule
        const lost = transactions
            .filter(t =>
                t.type === TransactionType.DEDUCTED &&
                [
                    PointReason.UNPLANNED_ABSENCE,
                    PointReason.DELAY,
                    PointReason.DISCIPLINARY_SANCTION
                ].includes(t.reason as PointReason)
            )
            .reduce((sum: number, t: PointTransaction) => sum + Number(t.value), 0);

        return { gained, lost };
    }

    private canHavePoints(user: User): boolean {
        // Only EMPLOYEE role (and legacy OPERATOR/EMPLOYEE) can have points.
        // HR_ADMIN and SUPERVISOR cannot.
        // Check legacyRole or role relation if applicable
        // Assuming user.roleId or legacy check.
        // Ideally we check the Role entity name
        // For now, simple check based on restricted roles
        /*
        * Note: ImplementationPlan says "Only EMPLOYEE".
        * Restricted: HR_ADMIN, SUPERVISOR.
        */
        // If we have role object loaded:
        if (user.role) {
            return (user.role as any).name === 'EMPLOYEE';
        }
        // Fallback or specific logic if role not loaded (should be loaded ideally)
        // If strictly following logic from previous `points.service.ts`:
        const roleName = (user.role as any)?.name || user.legacyRole;
        return roleName === 'EMPLOYEE' || roleName === 'OPERATOR'; // Support legacy Operator as Employee
    }
}

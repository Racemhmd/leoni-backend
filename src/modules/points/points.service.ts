import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Between } from 'typeorm';
import { PointTransaction, TransactionType, PointReason } from '../../database/entities/point-transaction.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { SmsService } from '../notifications/sms.service';
import { AuditService } from '../audit/audit.service';
import { MAX_YEARLY_GAINED, MAX_YEARLY_LOST, POINT_TO_DT_RATE } from '../../config/points-rules.config';

// Raisons qui comptent dans le plafond annuel de pertes disciplinaires (CdC section 3.2)
const PENALTY_REASONS: PointReason[] = [
    PointReason.ABSENCE_SHORT,
    PointReason.ABSENCE_LONG,
    PointReason.UNPLANNED_ABSENCE,
    PointReason.DELAY,
    PointReason.DISCIPLINARY_SANCTION,
];

@Injectable()
export class PointsService {
    // Plafonds annuels — lus depuis la config immuable
    private readonly MAX_YEARLY_GAINED = MAX_YEARLY_GAINED;
    private readonly MAX_YEARLY_LOST = MAX_YEARLY_LOST; // CdC section 3.2 : max 25 points perdus
    private readonly POINT_TO_DT_RATE = POINT_TO_DT_RATE;

    constructor(
        @InjectRepository(PointTransaction)
        private pointsRepo: Repository<PointTransaction>,
        @InjectRepository(User)
        private usersRepo: Repository<User>,
        private dataSource: DataSource,
        private notificationsService: NotificationsService,
        private pushService: PushService,
        private smsService: SmsService,
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
            dtValue: Number((balance * this.POINT_TO_DT_RATE).toFixed(2)),
            maxGained: this.MAX_YEARLY_GAINED,
            maxLost: this.MAX_YEARLY_LOST,
        };
    }

    async getHistory(userId: number, filter: 'week' | 'month' | 'year' = 'month') {
        const query = this.pointsRepo.createQueryBuilder('pt')
            .where('pt.employeeId = :userId', { userId })
            .orderBy('pt.createdAt', 'DESC');

        const now = new Date();
        const startDate = new Date();

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

    async getTotalPointsDistributed(): Promise<number> {
        const result = await this.pointsRepo
            .createQueryBuilder('transaction')
            .select('SUM(transaction.value)', 'total')
            .where('transaction.type = :type', { type: TransactionType.EARNED })
            .getRawOne();
        return result ? parseFloat(result.total) || 0 : 0;
    }

    // --- Comptage mensuel des retards pour un employé (règle : pénalité dès le 2ème) ---
    async countMonthlyTardiness(userId: number, manager?: EntityManager): Promise<number> {
        const repo = manager ? manager.getRepository(PointTransaction) : this.pointsRepo;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        return repo.count({
            where: {
                employeeId: userId,
                reason: PointReason.DELAY,
                type: TransactionType.DEDUCTED,
                createdAt: Between(startOfMonth, endOfMonth),
            },
        });
    }

    // --- Ajout de points (montant déjà validé par le contrôleur via points-rules.config) ---
    async addPoints(
        userId: number,
        amount: number,
        reason: PointReason,
        description: string,
        authorId?: number,
    ) {
        const label = reason.replace(/_/g, ' ').toLowerCase();
        const labelCap = label.charAt(0).toUpperCase() + label.slice(1);

        const tx = await this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id: userId } });
            if (!user) throw new BadRequestException('Employé introuvable');

            if (!this.canHavePoints(user)) {
                throw new BadRequestException('Ce rôle ne peut pas avoir de points');
            }

            const stats = await this.getYearlyStats(userId, manager);
            if (stats.gained + amount > this.MAX_YEARLY_GAINED) {
                throw new BadRequestException(
                    `Plafond annuel atteint (${this.MAX_YEARLY_GAINED} pts). Déjà gagné : ${stats.gained} pts.`,
                );
            }

            const transaction = manager.create(PointTransaction, {
                employeeId: userId,
                type: TransactionType.EARNED,
                reason,
                value: amount,
                description,
            });
            await manager.save(transaction);
            await manager.increment(User, { id: userId }, 'pointsBalance', amount);

            const newBalance = (Number(user.pointsBalance) + amount).toFixed(1);

            await this.notificationsService.createNotification({
                employeeId: userId,
                title: 'Points attribués',
                message: `+${amount} pts pour ${labelCap}. Solde : ${newBalance} pts.`,
                type: NotificationType.POINT_GAIN,
            });

            if (authorId) {
                await this.auditService.log(authorId, 'ADD_POINTS', userId, 'User', {
                    message: `+${amount} pts. Raison : ${reason}. Description : ${description}`,
                });
            }

            return transaction;
        });

        // Fire push + SMS after transaction commits (best-effort, never blocks response)
        this.pushService.notifyUser(userId, 'Points attribués 🎉', `+${amount} pts — ${labelCap}`, 'points').catch(() => {});
        this.smsService.notifyUser(userId, `MotivUp: +${amount} pts (${labelCap})`, 'points').catch(() => {});

        return tx;
    }

    // --- Déduction de points (montant déjà validé par le contrôleur via points-rules.config) ---
    async deductPoints(
        userId: number,
        amount: number,
        reason: PointReason,
        description: string,
        authorId?: number,
    ) {
        const label = reason.replace(/_/g, ' ').toLowerCase();

        const tx = await this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id: userId } });
            if (!user) throw new BadRequestException('Employé introuvable');

            if (!this.canHavePoints(user)) {
                throw new BadRequestException('Ce rôle ne peut pas avoir de points');
            }

            if (Number(user.pointsBalance) < amount) {
                throw new BadRequestException(
                    `Solde insuffisant. Solde : ${user.pointsBalance}, déduction demandée : ${amount}`,
                );
            }

            const isPenalty = PENALTY_REASONS.includes(reason);
            if (isPenalty) {
                const stats = await this.getYearlyStats(userId, manager);
                if (stats.lost + amount > this.MAX_YEARLY_LOST) {
                    throw new BadRequestException(
                        `Plafond annuel de pertes atteint (${this.MAX_YEARLY_LOST} pts). Déjà perdu : ${stats.lost} pts.`,
                    );
                }
            }

            const transaction = manager.create(PointTransaction, {
                employeeId: userId,
                type: TransactionType.DEDUCTED,
                reason,
                value: amount,
                description,
            });
            await manager.save(transaction);
            await manager.decrement(User, { id: userId }, 'pointsBalance', amount);

            const newBalance = (Number(user.pointsBalance) - amount).toFixed(1);

            await this.notificationsService.createNotification({
                employeeId: userId,
                title: 'Points déduits',
                message: `-${amount} pts (${label}). Solde : ${newBalance} pts.`,
                type: NotificationType.POINT_LOSS,
            });

            if (authorId) {
                await this.auditService.log(authorId, 'DEDUCT_POINTS', userId, 'User', {
                    message: `-${amount} pts. Raison : ${reason}. Description : ${description}`,
                });
            }

            return transaction;
        });

        // Fire push + SMS after transaction commits (best-effort)
        this.pushService.notifyUser(userId, 'Points déduits', `-${amount} pts (${label})`, 'points').catch(() => {});
        this.smsService.notifyUser(userId, `MotivUp: -${amount} pts (${label})`, 'points').catch(() => {});

        return tx;
    }

    private async getYearlyStats(userId: number, manager?: EntityManager) {
        const repo = manager ? manager.getRepository(PointTransaction) : this.pointsRepo;
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        const transactions = await repo.find({
            where: { employeeId: userId, createdAt: Between(startOfYear, endOfYear) },
        });

        const gained = transactions
            .filter(t => t.type === TransactionType.EARNED)
            .reduce((sum, t) => sum + Number(t.value), 0);

        // Seules les pénalités CdC comptent dans le plafond de pertes
        const lost = transactions
            .filter(t => t.type === TransactionType.DEDUCTED && PENALTY_REASONS.includes(t.reason as PointReason))
            .reduce((sum, t) => sum + Number(t.value), 0);

        return { gained, lost };
    }

    private canHavePoints(user: User): boolean {
        if (user.role) {
            return (user.role as any).name === 'EMPLOYEE';
        }
        const roleName = (user.role as any)?.name || user.legacyRole;
        return roleName === 'EMPLOYEE' || roleName === 'OPERATOR';
    }
}

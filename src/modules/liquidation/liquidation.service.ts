import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, IsNull, Not } from 'typeorm';
import { Liquidation, LiquidationSessionId } from '../../database/entities/liquidation.entity';
import { PointTransaction, TransactionType, PointReason } from '../../database/entities/point-transaction.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../notifications/sms.service';
import { POINT_TO_DT_RATE } from '../../config/points-rules.config';

// ─────────────────────────────────────────────────────────────────────────────
// Calendrier de liquidation — fenêtres de période exactes (CdC MotivUp)
// ─────────────────────────────────────────────────────────────────────────────

/** Retourne le 1er jour du mois à 00:00:00 */
const startOf = (year: number, month: number): Date =>
    new Date(year, month, 1, 0, 0, 0, 0);

/** Retourne le dernier instant du mois (dernier jour à 23:59:59.999) */
const endOf = (year: number, month: number): Date =>
    new Date(year, month + 1, 0, 23, 59, 59, 999);

export interface PeriodWindow {
    start: Date;
    end: Date;
}

export interface SessionConfig {
    id: LiquidationSessionId;
    name: string;         // 'Liquidation de Février'
    shortName: string;    // 'Février'
    month: number;        // 0-indexed — 1 = Février
    // Fenêtre pour les gains standard (Best Employee, CIP, Présence, Best Team)
    getEarnedWindow(year: number): PeriodWindow;
    // Fenêtre AIP+ (période semestrielle distincte)
    getAipPlusWindow(year: number): PeriodWindow;
    // Fenêtre des pénalités (absences, retards, sanctions)
    getPenaltiesWindow(year: number): PeriodWindow;
    getExecutionDate(year: number): Date;
}

export const LIQUIDATION_SESSIONS: SessionConfig[] = [
    {
        id: 'FEB',
        name: 'Liquidation de Février',
        shortName: 'Février',
        month: 1,
        getEarnedWindow: (y) => ({ start: startOf(y - 1, 9), end: endOf(y - 1, 11) }),  // Oct-Déc (N-1)
        getAipPlusWindow: (y) => ({ start: startOf(y - 1, 3), end: endOf(y - 1, 8) }), // Avr-Sep (N-1) — AIP+ L2
        getPenaltiesWindow: (y) => ({ start: startOf(y - 1, 11), end: endOf(y, 0) }),  // Déc(N-1)-Jan(N)
        getExecutionDate: (y) => new Date(y, 1, 1, 8, 0, 0),
    },
    {
        id: 'MAY',
        name: 'Liquidation de Mai',
        shortName: 'Mai',
        month: 4,
        getEarnedWindow: (y) => ({ start: startOf(y, 0), end: endOf(y, 2) }),           // Jan-Mar
        getAipPlusWindow: (y) => ({ start: startOf(y - 1, 6), end: endOf(y - 1, 11) }), // Juil-Déc(N-1) — AIP+ L3
        getPenaltiesWindow: (y) => ({ start: startOf(y, 1), end: endOf(y, 3) }),        // Fév-Avr
        getExecutionDate: (y) => new Date(y, 4, 1, 8, 0, 0),
    },
    {
        id: 'AUG',
        name: "Liquidation d'Août",
        shortName: 'Août',
        month: 7,
        getEarnedWindow: (y) => ({ start: startOf(y, 3), end: endOf(y, 5) }),           // Avr-Jun
        getAipPlusWindow: (y) => ({ start: startOf(y - 1, 9), end: endOf(y, 2) }),     // Oct(N-1)-Mar(N) — AIP+ L4
        getPenaltiesWindow: (y) => ({ start: startOf(y, 4), end: endOf(y, 6) }),       // Mai-Jul
        getExecutionDate: (y) => new Date(y, 7, 1, 8, 0, 0),
    },
    {
        id: 'NOV',
        name: 'Liquidation de Novembre',
        shortName: 'Novembre',
        month: 10,
        getEarnedWindow: (y) => ({ start: startOf(y, 6), end: endOf(y, 8) }),           // Juil-Sep
        getAipPlusWindow: (y) => ({ start: startOf(y, 0), end: endOf(y, 5) }),         // Jan-Jun — AIP+ L1
        getPenaltiesWindow: (y) => ({ start: startOf(y, 7), end: endOf(y, 9) }),       // Aoû-Oct
        getExecutionDate: (y) => new Date(y, 10, 1, 8, 0, 0),
    },
];

// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeLiquidationPreview {
    userId: number;
    fullName: string;
    matricule: string;
    pointsGained: number;
    pointsLost: number;
    netPoints: number;
    amountDT: number;
    earnedTransactions: PointTransaction[];
    deductedTransactions: PointTransaction[];
}

export interface SessionCalendarEntry {
    id: LiquidationSessionId;
    name: string;
    shortName: string;
    executionDate: string;          // ISO date string
    daysRemaining: number | null;   // null si passée
    status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'MISSED';
    totalAmountDT?: number;         // pour les sessions complétées
    totalEmployees?: number;
}

@Injectable()
export class LiquidationService {
    private readonly logger = new Logger(LiquidationService.name);

    constructor(
        @InjectRepository(Liquidation)
        private liquidationRepo: Repository<Liquidation>,
        @InjectRepository(PointTransaction)
        private pointsRepo: Repository<PointTransaction>,
        @InjectRepository(User)
        private usersRepo: Repository<User>,
        private dataSource: DataSource,
        private notificationsService: NotificationsService,
        private smsService: SmsService,
    ) { }

    // ── Utilitaires sessions ──────────────────────────────────────────────────

    getSessionById(sessionId: string): SessionConfig {
        const s = LIQUIDATION_SESSIONS.find(s => s.id === sessionId);
        if (!s) throw new NotFoundException(`Session de liquidation "${sessionId}" inconnue`);
        return s;
    }

    getNextSession(): { session: SessionConfig; year: number; executionDate: Date; daysRemaining: number } {
        const now = new Date();
        const currentYear = now.getFullYear();

        for (const session of LIQUIDATION_SESSIONS) {
            const execDate = session.getExecutionDate(currentYear);
            if (execDate > now) {
                const msLeft = execDate.getTime() - now.getTime();
                return {
                    session,
                    year: currentYear,
                    executionDate: execDate,
                    daysRemaining: Math.ceil(msLeft / (1000 * 60 * 60 * 24)),
                };
            }
        }

        // Toutes les sessions de l'année sont passées → prochaine = FEB de l'année prochaine
        const nextYear = currentYear + 1;
        const febSession = LIQUIDATION_SESSIONS[0];
        const execDate = febSession.getExecutionDate(nextYear);
        const msLeft = execDate.getTime() - now.getTime();
        return {
            session: febSession,
            year: nextYear,
            executionDate: execDate,
            daysRemaining: Math.ceil(msLeft / (1000 * 60 * 60 * 24)),
        };
    }

    /** Vérifie si une session a déjà été exécutée pour l'année donnée. */
    async isSessionExecuted(sessionId: LiquidationSessionId, year: number): Promise<boolean> {
        const count = await this.liquidationRepo.count({ where: { session: sessionId } });
        if (count > 0) {
            // Vérifie que des enregistrements correspondent à l'année
            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year, 11, 31, 23, 59, 59);
            const yearCount = await this.liquidationRepo.count({
                where: {
                    session: sessionId,
                    liquidationDate: Between(startOfYear, endOfYear),
                },
            });
            return yearCount > 0;
        }
        return false;
    }

    // ── Calendrier ────────────────────────────────────────────────────────────

    async getCalendar(year?: number): Promise<SessionCalendarEntry[]> {
        const now = new Date();
        const targetYear = year ?? now.getFullYear();

        const entries: SessionCalendarEntry[] = [];

        for (const session of LIQUIDATION_SESSIONS) {
            const execDate = session.getExecutionDate(targetYear);
            const msLeft = execDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            const isExecuted = await this.isSessionExecuted(session.id, targetYear);

            let status: SessionCalendarEntry['status'];
            if (isExecuted) {
                status = 'COMPLETED';
            } else if (daysRemaining <= 0 && !isExecuted) {
                status = execDate.getFullYear() < now.getFullYear() ? 'MISSED' : 'CURRENT';
            } else {
                status = 'UPCOMING';
            }

            const entry: SessionCalendarEntry = {
                id: session.id,
                name: session.name,
                shortName: session.shortName,
                executionDate: execDate.toISOString().split('T')[0],
                daysRemaining: daysRemaining > 0 ? daysRemaining : null,
                status,
            };

            if (status === 'COMPLETED') {
                const startOfYear = new Date(targetYear, 0, 1);
                const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59);
                const records = await this.liquidationRepo.find({
                    where: {
                        session: session.id,
                        liquidationDate: Between(startOfYear, endOfYear),
                    },
                });
                entry.totalAmountDT = records.reduce((sum, r) => sum + Number(r.dtAmount), 0);
                entry.totalEmployees = records.length;
            }

            entries.push(entry);
        }

        return entries;
    }

    // ── Calcul par employé ────────────────────────────────────────────────────

    async calculateForEmployee(userId: number, sessionId: string, year: number): Promise<EmployeeLiquidationPreview> {
        const session = this.getSessionById(sessionId);
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`Employé ${userId} introuvable`);

        const earnedWindow = session.getEarnedWindow(year);
        const aipPlusWindow = session.getAipPlusWindow(year);
        const penaltiesWindow = session.getPenaltiesWindow(year);

        // Gains standard (hors AIP+) dans la fenêtre standard
        const standardEarned = await this.pointsRepo.find({
            where: {
                employeeId: userId,
                type: TransactionType.EARNED,
                reason: Not(PointReason.AIP_PLUS) as any,
                createdAt: Between(earnedWindow.start, earnedWindow.end),
                liquidationId: IsNull(),
            },
        });

        // AIP+ dans sa fenêtre semestrielle dédiée
        const aipEarned = await this.pointsRepo.find({
            where: {
                employeeId: userId,
                type: TransactionType.EARNED,
                reason: PointReason.AIP_PLUS,
                createdAt: Between(aipPlusWindow.start, aipPlusWindow.end),
                liquidationId: IsNull(),
            },
        });

        const earnedTransactions = [...standardEarned, ...aipEarned];

        // Pénalités dans la fenêtre dédiée
        const deductedTransactions = await this.pointsRepo.find({
            where: {
                employeeId: userId,
                type: TransactionType.DEDUCTED,
                createdAt: Between(penaltiesWindow.start, penaltiesWindow.end),
                liquidationId: IsNull(),
            },
        });

        const pointsGained = earnedTransactions.reduce((sum, t) => sum + Number(t.value), 0);
        const pointsLost = deductedTransactions.reduce((sum, t) => sum + Number(t.value), 0);
        const netPoints = Math.max(0, pointsGained - pointsLost);
        const amountDT = netPoints * POINT_TO_DT_RATE;

        return {
            userId,
            fullName: user.fullName,
            matricule: user.matricule,
            pointsGained,
            pointsLost,
            netPoints,
            amountDT,
            earnedTransactions,
            deductedTransactions,
        };
    }

    async calculateForAll(sessionId: string, year: number): Promise<{
        sessionId: string;
        year: number;
        employees: Omit<EmployeeLiquidationPreview, 'earnedTransactions' | 'deductedTransactions'>[];
        totals: { totalEmployees: number; totalNetPoints: number; totalAmountDT: number };
    }> {
        const employees = await this.usersRepo.find({
            where: { isActive: true },
            relations: ['role'],
        });

        const employeeUsers = employees.filter(u => {
            const roleName = (u.role as any)?.name || u.legacyRole;
            return (roleName === 'EMPLOYEE' || roleName === 'OPERATOR')
                && !u.keepPointsAtLiquidation;   // respecte le choix "garder mes points"
        });

        const results = await Promise.all(
            employeeUsers.map(u => this.calculateForEmployee(u.id, sessionId, year)),
        );

        // Tri par montant DT décroissant
        const sorted = results
            .sort((a, b) => b.amountDT - a.amountDT)
            .map(({ earnedTransactions: _, deductedTransactions: __, ...rest }) => rest);

        const totals = {
            totalEmployees: sorted.length,
            totalNetPoints: sorted.reduce((sum, r) => sum + r.netPoints, 0),
            totalAmountDT: sorted.reduce((sum, r) => sum + r.amountDT, 0),
        };

        return { sessionId, year, employees: sorted, totals };
    }

    // ── Exécution ─────────────────────────────────────────────────────────────

    async executeSession(sessionId: string, _authorId: number): Promise<{ executed: number; totalDT: number }> {
        const year = new Date().getFullYear();

        if (await this.isSessionExecuted(sessionId as LiquidationSessionId, year)) {
            throw new BadRequestException(`La session ${sessionId} a déjà été exécutée pour ${year}`);
        }

        const preview = await this.calculateForAll(sessionId, year);
        let executed = 0;
        let totalDT = 0;

        const session = this.getSessionById(sessionId);
        const earnedWindow = session.getEarnedWindow(year);
        const aipPlusWindow = session.getAipPlusWindow(year);
        const penaltiesWindow = session.getPenaltiesWindow(year);

        for (const emp of preview.employees) {
            if (emp.netPoints <= 0) continue;

            await this.dataSource.transaction(async (manager) => {
                // Créer l'enregistrement de liquidation
                const record = manager.create(Liquidation, {
                    userId: emp.userId,
                    session: sessionId as LiquidationSessionId,
                    pointsAmount: emp.netPoints,
                    dtAmount: emp.amountDT,
                    liquidationDate: new Date(),
                    periodStart: earnedWindow.start,
                    periodEnd: penaltiesWindow.end,
                });
                const saved = await manager.save(record);

                // Marquer les transactions comme liquidées
                await manager.createQueryBuilder()
                    .update(PointTransaction)
                    .set({ liquidationId: saved.id })
                    .where('employee_id = :uid', { uid: emp.userId })
                    .andWhere('type = :type', { type: TransactionType.EARNED })
                    .andWhere('reason != :aip', { aip: PointReason.AIP_PLUS })
                    .andWhere('created_at BETWEEN :start AND :end', {
                        start: earnedWindow.start, end: earnedWindow.end,
                    })
                    .andWhere('liquidation_id IS NULL')
                    .execute();

                await manager.createQueryBuilder()
                    .update(PointTransaction)
                    .set({ liquidationId: saved.id })
                    .where('employee_id = :uid', { uid: emp.userId })
                    .andWhere('type = :type', { type: TransactionType.EARNED })
                    .andWhere('reason = :aip', { aip: PointReason.AIP_PLUS })
                    .andWhere('created_at BETWEEN :start AND :end', {
                        start: aipPlusWindow.start, end: aipPlusWindow.end,
                    })
                    .andWhere('liquidation_id IS NULL')
                    .execute();

                await manager.createQueryBuilder()
                    .update(PointTransaction)
                    .set({ liquidationId: saved.id })
                    .where('employee_id = :uid', { uid: emp.userId })
                    .andWhere('type = :type', { type: TransactionType.DEDUCTED })
                    .andWhere('created_at BETWEEN :start AND :end', {
                        start: penaltiesWindow.start, end: penaltiesWindow.end,
                    })
                    .andWhere('liquidation_id IS NULL')
                    .execute();

                // Déduire les points liquidés du solde
                await manager.decrement(User, { id: emp.userId }, 'pointsBalance', emp.netPoints);

                // Notifier l'employé (push in-app)
                await this.notificationsService.createNotification({
                    employeeId: emp.userId,
                    title: `${session.name} effectuée`,
                    message: `Félicitations ! ${emp.netPoints} points ont été convertis en ${emp.amountDT} DT.`,
                    type: NotificationType.REMINDER,
                });

                // SMS (best-effort, respecte l'opt-in notifSmsLiquidation)
                this.smsService.notifyUser(
                    emp.userId,
                    `MotivUp: ${session.shortName} — ${emp.netPoints} pts convertis en ${emp.amountDT} DT. Bravo !`,
                    'liquidation',
                ).catch(() => {});
            });

            executed++;
            totalDT += emp.amountDT;
            this.logger.log(`Liquidation ${sessionId} — employé ${emp.userId} : ${emp.netPoints} pts → ${emp.amountDT} DT`);
        }

        return { executed, totalDT };
    }

    // ── Rapport ───────────────────────────────────────────────────────────────

    async getReport(sessionId: string, year?: number): Promise<{
        sessionId: string;
        year: number;
        records: Array<{ userId: number; pointsAmount: number; dtAmount: number; liquidationDate: Date }>;
        totals: { totalEmployees: number; totalNetPoints: number; totalAmountDT: number };
    }> {
        const targetYear = year ?? new Date().getFullYear();
        const startOfYear = new Date(targetYear, 0, 1);
        const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59);

        const records = await this.liquidationRepo.find({
            where: {
                session: sessionId as LiquidationSessionId,
                liquidationDate: Between(startOfYear, endOfYear),
            },
        });

        const totals = {
            totalEmployees: records.length,
            totalNetPoints: records.reduce((sum, r) => sum + Number(r.pointsAmount), 0),
            totalAmountDT: records.reduce((sum, r) => sum + Number(r.dtAmount), 0),
        };

        return {
            sessionId,
            year: targetYear,
            records: records.map(r => ({
                userId: r.userId,
                pointsAmount: Number(r.pointsAmount),
                dtAmount: Number(r.dtAmount),
                liquidationDate: r.liquidationDate,
            })),
            totals,
        };
    }

    // ── Aperçu employé (pour l'écran Flutter) ────────────────────────────────

    async getMyPreview(userId: number): Promise<{
        nextSession: { id: string; name: string; executionDate: string; daysRemaining: number };
        preview: Omit<EmployeeLiquidationPreview, 'earnedTransactions' | 'deductedTransactions'> & {
            earnedEvents: Array<{ reason: string; value: number; date: string }>;
            deductedEvents: Array<{ reason: string; value: number; date: string }>;
        };
    }> {
        const { session, year, executionDate, daysRemaining } = this.getNextSession();
        const full = await this.calculateForEmployee(userId, session.id, year);

        return {
            nextSession: {
                id: session.id,
                name: session.name,
                executionDate: executionDate.toISOString().split('T')[0],
                daysRemaining,
            },
            preview: {
                userId: full.userId,
                fullName: full.fullName,
                matricule: full.matricule,
                pointsGained: full.pointsGained,
                pointsLost: full.pointsLost,
                netPoints: full.netPoints,
                amountDT: full.amountDT,
                earnedEvents: full.earnedTransactions.map(t => ({
                    reason: t.reason,
                    value: Number(t.value),
                    date: t.createdAt.toISOString().split('T')[0],
                })),
                deductedEvents: full.deductedTransactions.map(t => ({
                    reason: t.reason,
                    value: Number(t.value),
                    date: t.createdAt.toISOString().split('T')[0],
                })),
            },
        };
    }
}

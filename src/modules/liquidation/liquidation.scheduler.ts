import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LiquidationService, LIQUIDATION_SESSIONS } from './liquidation.service';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class LiquidationScheduler {
    private readonly logger = new Logger(LiquidationScheduler.name);

    constructor(
        private readonly liquidationService: LiquidationService,
        private readonly notificationsService: NotificationsService,
        @InjectRepository(User)
        private readonly usersRepo: Repository<User>,
    ) { }

    // ─────────────────────────────────────────────────────────────────────────
    // Rappels J-30, J-7, J-1 — tourne chaque matin à 06:00
    // ─────────────────────────────────────────────────────────────────────────

    @Cron('0 6 * * *') // Tous les jours à 06:00
    async sendReminderNotifications() {
        const now = new Date();
        const year = now.getFullYear();

        for (const session of LIQUIDATION_SESSIONS) {
            const execDate = session.getExecutionDate(year);
            const msLeft = execDate.getTime() - now.getTime();
            const daysLeft = Math.round(msLeft / (1000 * 60 * 60 * 24));

            if (daysLeft === 30 || daysLeft === 7 || daysLeft === 1) {
                await this.broadcastReminderToAllEmployees(session.name, daysLeft);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Exécution automatique Jour J à 08:00 (1er Feb, Mai, Août, Nov)
    // Cron : 0 8 1 2,5,8,11 *
    // ─────────────────────────────────────────────────────────────────────────

    @Cron('0 8 1 2,5,8,11 *')
    async autoExecuteLiquidation() {
        const now = new Date();
        const month = now.getMonth(); // 0-indexed

        const sessionMap: Record<number, string> = {
            1: 'FEB',
            4: 'MAY',
            7: 'AUG',
            10: 'NOV',
        };

        const sessionId = sessionMap[month];
        if (!sessionId) return;

        const year = now.getFullYear();
        const alreadyDone = await this.liquidationService.isSessionExecuted(sessionId as any, year);

        if (alreadyDone) {
            this.logger.log(`Cron J : session ${sessionId}/${year} déjà exécutée manuellement — skip`);
            return;
        }

        this.logger.log(`Cron J : déclenchement automatique de la session ${sessionId}/${year}`);
        try {
            const result = await this.liquidationService.executeSession(sessionId, 0); // authorId=0 = système
            this.logger.log(`Cron J : ${result.executed} employés liquidés, ${result.totalDT} DT au total`);
        } catch (err) {
            this.logger.error(`Cron J : échec de la session ${sessionId} — ${err.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private async broadcastReminderToAllEmployees(sessionName: string, daysLeft: number) {
        const employees = await this.usersRepo.find({
            where: { isActive: true },
            relations: ['role'],
        });

        const activeEmployees = employees.filter(u => {
            const roleName = (u.role as any)?.name || u.legacyRole;
            return roleName === 'EMPLOYEE' || roleName === 'OPERATOR';
        });

        const title = `${sessionName} dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`;
        let message: string;

        if (daysLeft === 30) {
            message = `Votre liquidation trimestrielle approche ! Dans 30 jours, vos points seront convertis en DT.`;
        } else if (daysLeft === 7) {
            message = `Dans 7 jours, vos points seront liquidés. Consultez votre solde pour voir le montant estimé.`;
        } else {
            message = `Demain, vos points de la période seront convertis en DT. Vérifiez votre solde.`;
        }

        const notifications = activeEmployees.map(emp =>
            this.notificationsService.createNotification({
                employeeId: emp.id,
                title,
                message,
                type: NotificationType.REMINDER,
            }),
        );

        await Promise.allSettled(notifications);
        this.logger.log(`Rappel J-${daysLeft} : ${activeEmployees.length} notifications envoyées pour "${sessionName}"`);
    }
}

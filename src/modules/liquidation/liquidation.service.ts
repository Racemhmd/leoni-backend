import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, IsNull } from 'typeorm';
import { Liquidation } from '../../database/entities/liquidation.entity';
import { PointTransaction, TransactionType } from '../../database/entities/point-transaction.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LiquidationService {
    private readonly logger = new Logger(LiquidationService.name);
    private readonly POINT_VALUE_DT = 10;

    constructor(
        @InjectRepository(Liquidation)
        private liquidationRepository: Repository<Liquidation>,
        @InjectRepository(PointTransaction)
        private pointsRepo: Repository<PointTransaction>,
        @InjectRepository(User)
        private usersRepo: Repository<User>,
        private dataSource: DataSource,
        private notificationsService: NotificationsService,
    ) { }

    // This method should be called by a Cron Job (e.g. on 1st of Feb, May, Aug, Nov)
    async runLiquidationForUser(userId: number) {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id: userId } });
            if (!user) return;

            // 1. Determine Period
            const { start, end } = this.getLiquidationPeriod();
            if (!start || !end) {
                this.logger.warn(`Current date is not a liquidation month (Feb, May, Aug, Nov)`);
                return;
            }

            // 2. Fetch Unliquidated Transactions in Period
            const transactions = await manager.find(PointTransaction, {
                where: {
                    employeeId: userId,
                    createdAt: Between(start, end),
                    liquidationId: IsNull()
                }
            });

            if (transactions.length === 0) {
                return;
            }

            // 3. Calculate Net Points
            let earned = 0;
            let deducted = 0;

            for (const t of transactions) {
                if (t.type === TransactionType.EARNED) {
                    earned += Number(t.value);
                } else if (t.type === TransactionType.DEDUCTED) {
                    deducted += Number(t.value);
                }
            }

            const netPoints = earned - deducted;

            // 4. Process Liquidation
            if (netPoints > 0) {
                // Convert to DT
                const dtAmount = netPoints * this.POINT_VALUE_DT;

                // Create Liquidation Record
                const liquidation = manager.create(Liquidation, {
                    userId,
                    pointsAmount: netPoints,
                    dtAmount,
                    liquidationDate: new Date(),
                    periodStart: start,
                    periodEnd: end,
                });
                const savedLiquidation = await manager.save(liquidation);

                // Update Transactions (Mark as Liquidated)
                // We update with the liquidation ID so they are not used again
                await manager.update(PointTransaction,
                    transactions.map(t => t.id),
                    { liquidationId: savedLiquidation.id }
                );

                // Update User Balance? 
                // "Liquidated points cannot be reused".
                // Does this mean they are removed from the *current balance*?
                // YES. If they are converted to Money (DT), they leave the "Points Wallet".
                // Otherwise user has Money AND Points.
                await manager.decrement(User, { id: userId }, 'pointsBalance', netPoints);

                // Notify
                await this.notificationsService.createNotification({
                    employeeId: userId,
                    title: 'Quarterly Liquidation',
                    message: `Congratulations! ${netPoints} points have been liquidated into ${dtAmount} DT.`,
                    type: NotificationType.POINT_LOSS
                });

                this.logger.log(`Liquidated ${netPoints} points for user ${userId}`);
            } else {
                // Net is 0 or negative.
                // Mark transactions as processed anyway so they don't drag down future periods?
                // OR carry over negative?
                // Prompt: "Liquidated points cannot be reused".
                // If we don't mark them, they will be picked up next time?
                // But next time filters by *date range*.
                // So if we don't mark them, they are just ignored in future calculations (because future calc uses new date range).
                // So effectively they are "expired" if not positive.

                // However, to be clean, we can mark them as liquidated with 0 value if we want to show "Processed".
                // For now, leaving them null means they remain in history but won't be picked up by NEXT quarter's date range.
                // THIS IS CORRECT behavior for "Period based" liquidation.
            }
        });
    }

    private getLiquidationPeriod(): { start: Date | undefined, end: Date | undefined } {
        const now = new Date();
        const month = now.getMonth(); // 0-11
        const year = now.getFullYear();

        // Liquidation Months: Feb (1), May (4), Aug (7), Nov (10)
        // Periods: Prev 3 months

        // Feb (1) -> Nov, Dec, Jan
        if (month === 1) {
            return {
                start: new Date(year - 1, 10, 1), // Nov 1st prev year
                end: new Date(year, 0, 31, 23, 59, 59) // Jan 31st
            };
        }
        // May (4) -> Feb, Mar, Apr
        if (month === 4) {
            return {
                start: new Date(year, 1, 1),
                end: new Date(year, 3, 30, 23, 59, 59)
            };
        }
        // Aug (7) -> May, Jun, Jul
        if (month === 7) {
            return {
                start: new Date(year, 4, 1),
                end: new Date(year, 6, 31, 23, 59, 59)
            };
        }
        // Nov (10) -> Aug, Sep, Oct
        if (month === 10) {
            return {
                start: new Date(year, 7, 1),
                end: new Date(year, 9, 31, 23, 59, 59)
            };
        }

        return { start: undefined, end: undefined };
    }
}

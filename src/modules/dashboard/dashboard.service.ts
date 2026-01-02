import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PointsService } from '../points/points.service';

@Injectable()
export class DashboardService {
    constructor(
        private usersService: UsersService,
        private pointsService: PointsService,
    ) { }

    async getEmployeeDashboard(userId: number) {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        const history = await this.pointsService.getHistory(userId);
        // Limit history to recent 5 items if desired, but for now returning all or let frontend handle.
        // Let's slice it here for "Recent"
        const recentTransactions = history.slice(0, 5);

        const availableRewards = [
            {
                type: 'CANTINE',
                name: 'Cantine Meal',
                cost: 10,
                description: 'Redeem points for a meal at the cantine.'
            },
            {
                type: 'XMALL',
                name: 'XMall Vouchers',
                cost: 50,
                description: 'Convert points to XMall vouchers.'
            },
            {
                type: 'OTHER',
                name: 'Special Rewards',
                description: 'Check with HR for other special rewards.'
            }
        ];

        return {
            employee: {
                fullName: user.fullName,
                matricule: user.matricule,
                department: user.department,
                pointsBalance: user.pointsBalance,
                leaveBalance: user.leaveBalance,
            },
            recentTransactions: recentTransactions,
            availableRewards: availableRewards,
            consumptionGuide: {
                text: "You can use your points to buy meals at the Cantine or convert them to vouchers for XMall. 10 points = 1 Meal. 50 points = 10 TND Voucher.",
                conversionRate: "1 Point = 0.2 TND (Approx)"
            }
        };
    }
}

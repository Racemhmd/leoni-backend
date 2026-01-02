import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { PointTransaction } from '../../database/entities/point-transaction.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class PointsService {
    constructor(
        @InjectRepository(PointTransaction)
        private pointsRepository: Repository<PointTransaction>,
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        private dataSource: DataSource,
    ) { }

    async getBalance(userId: number): Promise<number> {
        const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['role'] });
        if (!user) return 0;

        // Business Rule: Only EMPLOYEE and OPERATOR can have points
        if (this.isRestricted(user)) {
            return 0;
        }

        return user.pointsBalance;
    }

    async getHistory(userId: number) {
        const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['role'] });
        if (user && this.isRestricted(user)) {
            return [];
        }

        return this.pointsRepository.find({
            where: { employeeId: userId },
            order: { createdAt: 'DESC' },
        });
    }

    async getAllHistory() {
        return this.pointsRepository.find({
            order: { createdAt: 'DESC' },
            relations: ['employee']
        });
    }

    async addPoints(userId: number, amount: number, type: string, description: string, manager?: EntityManager) {
        if (manager) {
            return this.addPointsWithManager(manager, userId, amount, type, description);
        }
        return this.dataSource.transaction(async (m) => {
            return this.addPointsWithManager(m, userId, amount, type, description);
        });
    }

    private async addPointsWithManager(manager: EntityManager, userId: number, amount: number, type: string, description: string) {
        const user = await manager.findOne(User, { where: { id: userId }, relations: ['role'] });
        if (!user) throw new BadRequestException('User not found');

        if (this.isRestricted(user)) {
            throw new BadRequestException('Points are disabled for this user role');
        }

        const transaction = manager.create(PointTransaction, {
            employeeId: userId,
            type: type as any,
            value: amount,
            description,
        });
        await manager.save(transaction);
        await manager.increment(User, { id: userId }, 'pointsBalance', amount);
    }

    async deductPoints(userId: number, amount: number, type: string, description: string, manager?: EntityManager) {
        if (manager) {
            return this.deductPointsWithManager(manager, userId, amount, type, description);
        }
        return this.dataSource.transaction(async (m) => {
            return this.deductPointsWithManager(m, userId, amount, type, description);
        });
    }

    private async deductPointsWithManager(manager: EntityManager, userId: number, amount: number, type: string, description: string) {
        const user = await manager.findOne(User, { where: { id: userId }, relations: ['role'] });
        if (!user) throw new BadRequestException('User not found');

        if (this.isRestricted(user)) {
            throw new BadRequestException('Points are disabled for this user role');
        }

        // Allow negative balance? Usually no, but for "Penalty" maybe?
        // Let's enforce non-negative for now unless it's a penalty that forces it?
        // Requirement didn't strictly say. Let's assume standard behavior: check balance.
        // But for "Absence Penalty" maybe we can go negative?
        // Let's stick to "Check balance" to be safe, or allow it if type is penalty?
        // For simplicity and to avoid blocking "Manual Adjustment", I will allow it but maybe warn?
        // Actually, previous code checked balance. I'll restore check.

        if (user.pointsBalance < amount) {
            throw new BadRequestException('Insufficient points');
        }

        const transaction = manager.create(PointTransaction, {
            employeeId: userId,
            type: type as any,
            value: -amount,
            description,
        });
        await manager.save(transaction);
        await manager.decrement(User, { id: userId }, 'pointsBalance', amount);
    }



    async consumePointsForXmall(userId: number, amount: number, description: string) {
        // Validation: Verify if user has enough points
        const currentBalance = await this.getBalance(userId);
        if (currentBalance < amount) {
            throw new BadRequestException(`Insufficient points. Current: ${currentBalance}, Required: ${amount}`);
        }

        // Deduct points
        // We use 'XMALL_PURCHASE' as type
        await this.deductPoints(userId, amount, 'XMALL_PURCHASE', description);

        return {
            success: true,
            message: 'XMALL purchase successful',
            deductedPoints: amount,
            newBalance: currentBalance - amount
        };
    }

    async getTotalPointsDistributed(): Promise<number> {
        // Option 1: Sum of all current balances (simpler, reflects current liability)
        const result = await this.usersRepository.createQueryBuilder('user')
            .select('SUM(user.pointsBalance)', 'total')
            .getRawOne();
        return result.total ? parseInt(result.total, 10) : 0;
    }

    private isRestricted(user: User): boolean {
        // Check legacyRole or role relation
        const roleName = user.role ? user.role.name : user.legacyRole;
        // Allowed: EMPLOYEE
        // Restricted: HR_ADMIN, SUPERVISOR
        const restrictedRoles = ['HR_ADMIN', 'SUPERVISOR'];
        return restrictedRoles.includes(roleName as string);
    }
}

import { Controller, Get, Post, Body, UseGuards, Request, BadRequestException, Param, Ip } from '@nestjs/common';
import { PointsService } from './points.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';

@Controller('points')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PointsController {
    constructor(
        private readonly pointsService: PointsService,
        private readonly auditService: AuditService
    ) { }

    @Roles(UserRole.EMPLOYEE)
    @Get('balance')
    async getBalance(@Request() req: any) {
        const points = await this.pointsService.getBalance(req.user.id);
        return { points };
    }

    @Roles(UserRole.EMPLOYEE)
    @Get('history')
    async getHistory(@Request() req: any) {
        return this.pointsService.getHistory(req.user.id);
    }

    @Roles(UserRole.HR_ADMIN)
    @Get('all-transactions')
    async getAllTransactions() {
        return this.pointsService.getAllHistory();
    }

    @Roles(UserRole.EMPLOYEE) // Only employees can shop
    @Post('xmall')
    async xmallPurchase(@Request() req: any, @Body() body: { points: number; description: string }) {
        if (!body.points) throw new BadRequestException('Points amount is required');

        return this.pointsService.consumePointsForXmall(
            req.user.id,
            body.points,
            body.description || 'XMALL Purchase'
        );
    }

    @Roles(UserRole.HR_ADMIN)
    @Get('balance/:employeeId')
    async getEmployeeBalance(@Param('employeeId') employeeId: number) {
        const points = await this.pointsService.getBalance(employeeId);
        return { points };
    }

    @Roles(UserRole.HR_ADMIN)
    @Post('add')
    async addPoints(@Body() body: { employeeId: number; points: number; reason: string }, @Request() req: any, @Ip() ip: string) {
        if (!body.employeeId || !body.points || !body.reason) throw new BadRequestException('Missing parameters');

        // Fetch old balance
        const oldBalance = await this.pointsService.getBalance(body.employeeId);

        await this.pointsService.addPoints(body.employeeId, body.points, 'MANUAL_ADD', body.reason);

        // Log to audit
        await this.auditService.log(
            req.user.id,
            'ADD_POINTS',
            body.employeeId,
            'User',
            {
                points_added: body.points,
                old_balance: oldBalance,
                new_balance: oldBalance + body.points,
                reason: body.reason
            },
            ip,
            { matricule: req.user.matricule, role: req.user.role }
        );

        return { message: 'Points added successfully' };
    }

    @Roles(UserRole.HR_ADMIN)
    @Post('deduct')
    async deductPoints(@Body() body: { employeeId: number; points: number; reason: string }, @Request() req: any, @Ip() ip: string) {
        if (!body.employeeId || !body.points || !body.reason) throw new BadRequestException('Missing parameters');

        const oldBalance = await this.pointsService.getBalance(body.employeeId);

        await this.pointsService.deductPoints(body.employeeId, body.points, 'MANUAL_DEDUCT', body.reason);

        // Log to audit
        await this.auditService.log(
            req.user.id,
            'REMOVE_POINTS',
            body.employeeId,
            'User',
            {
                points_deducted: body.points,
                old_balance: oldBalance,
                new_balance: oldBalance - body.points,
                reason: body.reason
            },
            ip,
            { matricule: req.user.matricule, role: req.user.role }
        );

        return { message: 'Points deducted successfully' };
    }
}

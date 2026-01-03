import { Controller, Get, Post, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { PointsService } from './points.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';

@Controller('points')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PointsController {
    constructor(private readonly pointsService: PointsService) { }

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
    @Post('adjust')
    async adjustPoints(@Body() body: { employeeId: number; points: number; type: string; description: string }) {
        if (!body.employeeId || !body.points) throw new BadRequestException('Missing parameters');
        await this.pointsService.addPoints(body.employeeId, body.points, body.type, body.description || 'Manual Adjustment');
        return { message: 'Points adjusted' };
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
}

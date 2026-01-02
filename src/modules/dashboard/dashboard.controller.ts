import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
    constructor(private dashboardService: DashboardService) { }

    @Get()
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @ApiOperation({ summary: 'Get employee dashboard data' })
    async getDashboard(@Request() req: any) {
        return this.dashboardService.getEmployeeDashboard(req.user.id);
    }

    @Get('admin/stats')
    @Roles(UserRole.HR_ADMIN)
    @ApiOperation({ summary: 'Get admin dashboard statistics' })
    async getAdminStats() {
        return this.dashboardService.getAdminStats();
    }
}

import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { Reward } from '../../database/entities/reward.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';

@Controller('rewards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RewardsController {
    constructor(private readonly rewardsService: RewardsService) {}

    /** GET /rewards — catalogue actif (employee + HR_ADMIN) */
    @Roles(UserRole.EMPLOYEE, UserRole.HR_ADMIN, UserRole.SUPERVISOR)
    @Get()
    findAll(@Query('all') all?: string) {
        // HR_ADMIN peut voir toutes les récompenses y compris inactives
        const onlyActive = all !== 'true';
        return this.rewardsService.findAll(onlyActive);
    }

    /** GET /rewards/:id */
    @Roles(UserRole.EMPLOYEE, UserRole.HR_ADMIN, UserRole.SUPERVISOR)
    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.rewardsService.findOne(id);
    }

    /** POST /rewards — HR_ADMIN uniquement */
    @Roles(UserRole.HR_ADMIN)
    @Post()
    create(@Body() dto: Partial<Reward>) {
        return this.rewardsService.create(dto);
    }

    /** PATCH /rewards/:id — HR_ADMIN uniquement */
    @Roles(UserRole.HR_ADMIN)
    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: Partial<Reward>,
    ) {
        return this.rewardsService.update(id, dto);
    }

    /** DELETE /rewards/:id — HR_ADMIN uniquement */
    @Roles(UserRole.HR_ADMIN)
    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.rewardsService.remove(id);
    }
}

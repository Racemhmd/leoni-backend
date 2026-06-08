import {
    Controller, Get, Post, Body, UseGuards, Request,
    BadRequestException, Query, Param,
} from '@nestjs/common';
import { PointsService } from './points.service';
import { RewardsService } from '../rewards/rewards.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { PointReason } from '../../database/entities/point-transaction.entity';
import {
    getPointValue,
    resolveAbsenceReason,
    validatePointsInput,
} from '../../config/points-rules.config';

@Controller('points')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PointsController {
    constructor(
        private readonly pointsService: PointsService,
        private readonly rewardsService: RewardsService,
    ) { }

    // ── Employé ────────────────────────────────────────────────────────────────

    @Roles(UserRole.EMPLOYEE)
    @Get('balance')
    async getBalance(@Request() req: any) {
        const points = await this.pointsService.getBalance(req.user.id);
        return { points };
    }

    @Roles(UserRole.EMPLOYEE)
    @Get('summary')
    async getSummary(@Request() req: any) {
        return this.pointsService.getSummary(req.user.id);
    }

    @Roles(UserRole.EMPLOYEE)
    @Get('history')
    async getHistory(
        @Request() req: any,
        @Query('filter') filter: 'week' | 'month' | 'year' = 'month',
    ) {
        return this.pointsService.getHistory(req.user.id, filter);
    }

    @Roles(UserRole.EMPLOYEE)
    @Post('xmall')
    async xmallPurchase(
        @Request() req: any,
        @Body() body: { points: number; description: string },
    ) {
        if (!body.points) throw new BadRequestException('Le montant en points est requis');
        return this.pointsService.deductPoints(
            req.user.id,
            body.points,
            PointReason.XMALL_PURCHASE,
            body.description || 'Achat XMALL',
        );
    }

    /** Catalogue de récompenses — délégué à RewardsService (données en DB). */
    @Roles(UserRole.EMPLOYEE)
    @Get('rewards')
    getRewards() {
        return this.rewardsService.findAll(true);
    }

    // ── RH Admin ───────────────────────────────────────────────────────────────

    @Roles(UserRole.HR_ADMIN)
    @Get('balance/:employeeId')
    async getEmployeeBalance(@Param('employeeId') employeeId: number) {
        const points = await this.pointsService.getBalance(employeeId);
        return { points };
    }

    /**
     * Attribuer des points à un employé.
     *
     * Le champ `points` envoyé par le frontend est IGNORÉ — le backend impose
     * la valeur officielle définie dans points-rules.config.ts.
     * Exemple : { reason: "BEST_TEAM", points: 99 } → enregistre 5 pts.
     */
    @Roles(UserRole.HR_ADMIN)
    @Post('add')
    async addPoints(
        @Request() req: any,
        @Body() body: { employeeId: number; reason: PointReason; description?: string; points?: number },
    ) {
        if (!body.employeeId || !body.reason) {
            throw new BadRequestException('employeeId et reason sont requis');
        }

        let officialPoints: number;
        try {
            officialPoints = getPointValue(body.reason);
        } catch {
            throw new BadRequestException(`Raison inconnue : "${body.reason}"`);
        }

        // Loguer si le frontend a tenté une valeur non officielle
        if (body.points !== undefined && !validatePointsInput(body.reason, body.points)) {
            // Valeur soumise ignorée — on continue avec la valeur officielle
        }

        return this.pointsService.addPoints(
            body.employeeId,
            officialPoints,
            body.reason,
            body.description || `Attribution : ${body.reason}`,
            req.user.id,
        );
    }

    /**
     * Déduire des points à un employé.
     *
     * Paramètres spéciaux :
     * - `durationDays` (absences) : détermine automatiquement ABSENCE_SHORT vs ABSENCE_LONG.
     * - `justified` (absences) : si true et qu'un certificat médical est validé, aucune déduction.
     *
     * La valeur `points` soumise est IGNORÉE ; la valeur officielle du config est appliquée.
     */
    @Roles(UserRole.HR_ADMIN)
    @Post('deduct')
    async deductPoints(
        @Request() req: any,
        @Body() body: {
            employeeId: number;
            reason: PointReason;
            description?: string;
            points?: number;
            durationDays?: number;
            justified?: boolean;
        },
    ) {
        if (!body.employeeId || !body.reason) {
            throw new BadRequestException('employeeId et reason sont requis');
        }

        // Absence justifiée par certificat médical → aucune déduction (CdC section 3.2)
        if (body.justified === true) {
            return { skipped: true, reason: 'Absence justifiée — aucune déduction appliquée' };
        }

        // Résolution automatique ABSENCE_SHORT / ABSENCE_LONG selon durationDays
        let resolvedReason = body.reason;
        if (
            (body.reason === PointReason.UNPLANNED_ABSENCE ||
             body.reason === PointReason.ABSENCE_SHORT ||
             body.reason === PointReason.ABSENCE_LONG) &&
            body.durationDays !== undefined
        ) {
            resolvedReason = PointReason[resolveAbsenceReason(body.durationDays)];
        }

        // Retard : pénalité uniquement à partir du 2ème retard du mois (CdC section 3.2)
        if (resolvedReason === PointReason.DELAY) {
            const monthlyCount = await this.pointsService.countMonthlyTardiness(body.employeeId);
            if (monthlyCount === 0) {
                // Premier retard du mois → aucune pénalité
                return { skipped: true, reason: 'Premier retard du mois — aucune déduction (règle CdC)' };
            }
        }

        let officialPoints: number;
        try {
            officialPoints = getPointValue(resolvedReason);
        } catch {
            throw new BadRequestException(`Raison inconnue : "${resolvedReason}"`);
        }

        return this.pointsService.deductPoints(
            body.employeeId,
            officialPoints,
            resolvedReason,
            body.description || `Pénalité : ${resolvedReason}`,
            req.user.id,
        );
    }
}

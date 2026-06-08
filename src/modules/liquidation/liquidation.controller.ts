import { Controller, Get, Post, Param, Query, Request, UseGuards, ForbiddenException } from '@nestjs/common';
import { LiquidationService } from './liquidation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';

@Controller('liquidation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LiquidationController {
    constructor(private readonly liquidationService: LiquidationService) { }

    /**
     * Calendrier des 4 liquidations de l'année.
     * Statut : COMPLETED / CURRENT / UPCOMING / MISSED.
     */
    @Roles(UserRole.EMPLOYEE, UserRole.HR_ADMIN, UserRole.SUPERVISOR)
    @Get('calendar')
    async getCalendar(@Query('year') year?: string) {
        return this.liquidationService.getCalendar(year ? parseInt(year) : undefined);
    }

    /**
     * Prochaine liquidation : date + jours restants.
     */
    @Roles(UserRole.EMPLOYEE, UserRole.HR_ADMIN, UserRole.SUPERVISOR)
    @Get('next')
    getNext() {
        const { session, year, executionDate, daysRemaining } = this.liquidationService.getNextSession();
        return {
            id: session.id,
            name: session.name,
            shortName: session.shortName,
            executionDate: executionDate.toISOString().split('T')[0],
            year,
            daysRemaining,
        };
    }

    /**
     * Aperçu personnel : points de la période en cours + estimation DT.
     * Pour les employés uniquement — voit ses propres données.
     */
    @Roles(UserRole.EMPLOYEE)
    @Get('my-preview')
    async getMyPreview(@Request() req: any) {
        return this.liquidationService.getMyPreview(req.user.id);
    }

    /**
     * Simulation avant validation.
     * - HR_ADMIN : aperçu de tous les employés
     * - EMPLOYEE : aperçu de ses propres données (redirige vers my-preview)
     */
    @Roles(UserRole.HR_ADMIN, UserRole.EMPLOYEE)
    @Get(':sessionId/preview')
    async getPreview(
        @Param('sessionId') sessionId: string,
        @Query('year') year: string,
        @Request() req: any,
    ) {
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const role = (req.user.role as any)?.name || req.user.legacyRole;

        if (role === UserRole.HR_ADMIN || role === 'HR_ADMIN') {
            return this.liquidationService.calculateForAll(sessionId.toUpperCase(), targetYear);
        }

        // Employé : données personnelles uniquement
        return this.liquidationService.calculateForEmployee(req.user.id, sessionId.toUpperCase(), targetYear);
    }

    /**
     * Exécution de la liquidation — HR_ADMIN uniquement.
     * Enregistre les conversions pts → DT et notifie chaque employé.
     */
    @Roles(UserRole.HR_ADMIN)
    @Post(':sessionId/execute')
    async execute(@Param('sessionId') sessionId: string, @Request() req: any) {
        return this.liquidationService.executeSession(sessionId.toUpperCase(), req.user.id);
    }

    /**
     * Rapport post-liquidation.
     * - HR_ADMIN : rapport complet (tous les employés)
     * - EMPLOYEE : uniquement son propre enregistrement
     */
    @Roles(UserRole.HR_ADMIN, UserRole.EMPLOYEE)
    @Get(':sessionId/report')
    async getReport(
        @Param('sessionId') sessionId: string,
        @Query('year') year: string,
        @Request() req: any,
    ) {
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const role = (req.user.role as any)?.name || req.user.legacyRole;
        const report = await this.liquidationService.getReport(sessionId.toUpperCase(), targetYear);

        if (role !== UserRole.HR_ADMIN && role !== 'HR_ADMIN') {
            // Filtrer pour ne montrer que l'enregistrement de cet employé
            const myRecord = report.records.find(r => r.userId === req.user.id);
            return {
                sessionId: report.sessionId,
                year: report.year,
                myRecord: myRecord ?? null,
            };
        }

        return report;
    }
}

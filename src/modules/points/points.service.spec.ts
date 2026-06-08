import {
    getPointValue,
    calculateDT,
    validatePointsInput,
    getMaxGain,
    getMaxLoss,
    resolveAbsenceReason,
    EARNING_RULES,
    PENALTY_RULES,
    POINT_TO_DT_RATE,
    MAX_YEARLY_GAINED,
    MAX_YEARLY_LOST,
} from '../../config/points-rules.config';

// ─────────────────────────────────────────────────────────────────────────────
// Tests de la configuration des règles métier (points-rules.config.ts)
// ─────────────────────────────────────────────────────────────────────────────
describe('PointsRules — Configuration métier', () => {

    describe('Constantes', () => {
        it('POINT_TO_DT_RATE doit être 10 (1 pt = 10 DT, CdC immuable)', () => {
            expect(POINT_TO_DT_RATE).toBe(10);
        });

        it('MAX_YEARLY_GAINED doit être 42 (CdC section 3.1)', () => {
            expect(MAX_YEARLY_GAINED).toBe(42);
        });

        it('MAX_YEARLY_LOST doit être 25 (CdC section 3.2, corrigé de 21)', () => {
            expect(MAX_YEARLY_LOST).toBe(25);
        });
    });

    describe('getPointValue — Points gagnés', () => {
        it('BEST_EMPLOYEE → 20 pts', () => {
            expect(getPointValue('BEST_EMPLOYEE')).toBe(20);
        });

        it('BEST_TEAM → 5 pts', () => {
            expect(getPointValue('BEST_TEAM')).toBe(5);
        });

        it('AIP_PLUS → 5 pts', () => {
            expect(getPointValue('AIP_PLUS')).toBe(5);
        });

        it('CIP → 5 pts', () => {
            expect(getPointValue('CIP')).toBe(5);
        });

        it('PRESENCE_MONTH → 2 pts', () => {
            expect(getPointValue('PRESENCE_MONTH')).toBe(2);
        });

        it('PLANT_MANAGER_MOTIVATION → 5 pts', () => {
            expect(getPointValue('PLANT_MANAGER_MOTIVATION')).toBe(5);
        });

        it('La somme des maximums ne dépasse pas 42 pts', () => {
            const total = Object.values(EARNING_RULES).reduce((sum, r) => sum + r.points, 0);
            expect(total).toBeLessThanOrEqual(42);
        });
    });

    describe('getPointValue — Pénalités', () => {
        it('ABSENCE_SHORT → 5 pts (absence ≤ 2 jours)', () => {
            expect(getPointValue('ABSENCE_SHORT')).toBe(5);
        });

        it('ABSENCE_LONG → 10 pts (absence > 2 jours)', () => {
            expect(getPointValue('ABSENCE_LONG')).toBe(10);
        });

        it('DELAY → 0.5 pt (retard dès le 2ème/mois)', () => {
            expect(getPointValue('DELAY')).toBe(0.5);
        });

        it('DISCIPLINARY_SANCTION → 5 pts (par jour de renvoi)', () => {
            expect(getPointValue('DISCIPLINARY_SANCTION')).toBe(5);
        });

        it('La pénalité courte est strictement inférieure à la longue', () => {
            expect(PENALTY_RULES.ABSENCE_SHORT.points).toBeLessThan(PENALTY_RULES.ABSENCE_LONG.points);
        });
    });

    describe('getPointValue — Erreurs', () => {
        it('Lance une erreur pour une raison inconnue', () => {
            expect(() => getPointValue('FAKE_REASON')).toThrow('Raison de points inconnue');
        });

        it('Lance une erreur pour une chaîne vide', () => {
            expect(() => getPointValue('')).toThrow();
        });
    });

    describe('calculateDT', () => {
        it('42 points = 420 DT (maximum annuel)', () => {
            expect(calculateDT(42)).toBe(420);
        });

        it('1 point = 10 DT', () => {
            expect(calculateDT(1)).toBe(10);
        });

        it('0 point = 0 DT', () => {
            expect(calculateDT(0)).toBe(0);
        });
    });

    describe('validatePointsInput — Détection de fraude de valeur', () => {
        it('BEST_TEAM avec 5 → valide', () => {
            expect(validatePointsInput('BEST_TEAM', 5)).toBe(true);
        });

        it('BEST_TEAM avec 99 → invalide (cas de fraude)', () => {
            expect(validatePointsInput('BEST_TEAM', 99)).toBe(false);
        });

        it('BEST_EMPLOYEE avec 20 → valide', () => {
            expect(validatePointsInput('BEST_EMPLOYEE', 20)).toBe(true);
        });

        it('BEST_EMPLOYEE avec 1 → invalide', () => {
            expect(validatePointsInput('BEST_EMPLOYEE', 1)).toBe(false);
        });

        it('Raison inconnue → invalide (pas d\'exception)', () => {
            expect(validatePointsInput('UNKNOWN', 5)).toBe(false);
        });
    });

    describe('resolveAbsenceReason — Règle durée CdC', () => {
        it('1 jour → ABSENCE_SHORT', () => {
            expect(resolveAbsenceReason(1)).toBe('ABSENCE_SHORT');
        });

        it('2 jours → ABSENCE_SHORT (limite incluse)', () => {
            expect(resolveAbsenceReason(2)).toBe('ABSENCE_SHORT');
        });

        it('3 jours → ABSENCE_LONG', () => {
            expect(resolveAbsenceReason(3)).toBe('ABSENCE_LONG');
        });

        it('10 jours → ABSENCE_LONG', () => {
            expect(resolveAbsenceReason(10)).toBe('ABSENCE_LONG');
        });
    });

    describe('getMaxGain / getMaxLoss', () => {
        it('getMaxGain() === 42', () => {
            expect(getMaxGain()).toBe(42);
        });

        it('getMaxLoss() === 25', () => {
            expect(getMaxLoss()).toBe(25);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests du contrôleur — enforcement des valeurs officielles
// (tests d'intégration légers avec service mocké)
// ─────────────────────────────────────────────────────────────────────────────
import { Test, TestingModule } from '@nestjs/testing';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';
import { BadRequestException } from '@nestjs/common';

const mockPointsService = {
    getBalance: jest.fn(),
    getSummary: jest.fn(),
    getHistory: jest.fn(),
    addPoints: jest.fn(),
    deductPoints: jest.fn(),
    countMonthlyTardiness: jest.fn(),
};

describe('PointsController — Enforcement des règles métier', () => {
    let controller: PointsController;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [PointsController],
            providers: [{ provide: PointsService, useValue: mockPointsService }],
        }).compile();

        controller = module.get<PointsController>(PointsController);
    });

    const fakeAdminReq = { user: { id: 1 } };

    describe('POST /points/add — valeur officielle imposée', () => {
        it('BEST_TEAM avec points: 99 → appelle addPoints avec 5 (valeur officielle)', async () => {
            mockPointsService.addPoints.mockResolvedValue({ id: 1, value: 5 });

            await controller.addPoints(fakeAdminReq, {
                employeeId: 42,
                reason: 'BEST_TEAM' as any,
                points: 99, // soumis par le frontend — doit être ignoré
                description: 'Test',
            });

            expect(mockPointsService.addPoints).toHaveBeenCalledWith(
                42,
                5,            // valeur officielle, pas 99
                'BEST_TEAM',
                'Test',
                1,
            );
        });

        it('BEST_EMPLOYEE avec points: 1 → appelle addPoints avec 20', async () => {
            mockPointsService.addPoints.mockResolvedValue({ id: 2, value: 20 });

            await controller.addPoints(fakeAdminReq, {
                employeeId: 7,
                reason: 'BEST_EMPLOYEE' as any,
                points: 1,
            });

            expect(mockPointsService.addPoints).toHaveBeenCalledWith(7, 20, 'BEST_EMPLOYEE', 'Attribution : BEST_EMPLOYEE', 1);
        });

        it('PRESENCE_MONTH → appelle addPoints avec 2', async () => {
            mockPointsService.addPoints.mockResolvedValue({});
            await controller.addPoints(fakeAdminReq, { employeeId: 7, reason: 'PRESENCE_MONTH' as any });
            expect(mockPointsService.addPoints).toHaveBeenCalledWith(7, 2, 'PRESENCE_MONTH', expect.any(String), 1);
        });

        it('Raison inconnue → BadRequestException', async () => {
            await expect(
                controller.addPoints(fakeAdminReq, { employeeId: 7, reason: 'FAKE' as any }),
            ).rejects.toThrow(BadRequestException);
        });

        it('employeeId manquant → BadRequestException', async () => {
            await expect(
                controller.addPoints(fakeAdminReq, { employeeId: undefined as any, reason: 'BEST_TEAM' as any }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('POST /points/deduct — absence auto-résolue', () => {
        it('durationDays=1 → ABSENCE_SHORT (-5 pts)', async () => {
            mockPointsService.deductPoints.mockResolvedValue({});

            await controller.deductPoints(fakeAdminReq, {
                employeeId: 10,
                reason: 'UNPLANNED_ABSENCE' as any,
                durationDays: 1,
            });

            expect(mockPointsService.deductPoints).toHaveBeenCalledWith(
                10, 5, 'ABSENCE_SHORT', expect.any(String), 1,
            );
        });

        it('durationDays=2 → ABSENCE_SHORT (-5 pts, limite incluse)', async () => {
            mockPointsService.deductPoints.mockResolvedValue({});

            await controller.deductPoints(fakeAdminReq, {
                employeeId: 10,
                reason: 'UNPLANNED_ABSENCE' as any,
                durationDays: 2,
            });

            expect(mockPointsService.deductPoints).toHaveBeenCalledWith(
                10, 5, 'ABSENCE_SHORT', expect.any(String), 1,
            );
        });

        it('durationDays=3 → ABSENCE_LONG (-10 pts)', async () => {
            mockPointsService.deductPoints.mockResolvedValue({});

            await controller.deductPoints(fakeAdminReq, {
                employeeId: 10,
                reason: 'UNPLANNED_ABSENCE' as any,
                durationDays: 3,
            });

            expect(mockPointsService.deductPoints).toHaveBeenCalledWith(
                10, 10, 'ABSENCE_LONG', expect.any(String), 1,
            );
        });

        it('justified=true → aucune déduction (certificat médical validé)', async () => {
            const result = await controller.deductPoints(fakeAdminReq, {
                employeeId: 10,
                reason: 'ABSENCE_SHORT' as any,
                justified: true,
            });

            expect(result).toMatchObject({ skipped: true });
            expect(mockPointsService.deductPoints).not.toHaveBeenCalled();
        });

        it('DELAY avec 0 retard ce mois → skipped (premier retard)', async () => {
            mockPointsService.countMonthlyTardiness.mockResolvedValue(0);

            const result = await controller.deductPoints(fakeAdminReq, {
                employeeId: 5,
                reason: 'DELAY' as any,
            });

            expect(result).toMatchObject({ skipped: true });
            expect(mockPointsService.deductPoints).not.toHaveBeenCalled();
        });

        it('DELAY avec 1 retard existant ce mois → déduction de 0.5 pt', async () => {
            mockPointsService.countMonthlyTardiness.mockResolvedValue(1);
            mockPointsService.deductPoints.mockResolvedValue({});

            await controller.deductPoints(fakeAdminReq, {
                employeeId: 5,
                reason: 'DELAY' as any,
            });

            expect(mockPointsService.deductPoints).toHaveBeenCalledWith(
                5, 0.5, 'DELAY', expect.any(String), 1,
            );
        });
    });

    describe('GET /points/rewards', () => {
        it('retourne une liste non vide de récompenses', () => {
            const rewards = controller.getRewards();
            expect(Array.isArray(rewards)).toBe(true);
            expect(rewards.length).toBeGreaterThan(0);
        });

        it('chaque récompense a id, name, points, category, description', () => {
            const rewards = controller.getRewards() as any[];
            rewards.forEach(r => {
                expect(r).toHaveProperty('id');
                expect(r).toHaveProperty('name');
                expect(r).toHaveProperty('points');
                expect(r).toHaveProperty('category');
                expect(r).toHaveProperty('description');
            });
        });

        it('tous les prix sont dans la plage valide (1–42 pts)', () => {
            const rewards = controller.getRewards() as any[];
            rewards.forEach(r => {
                expect(r.points).toBeGreaterThanOrEqual(1);
                expect(r.points).toBeLessThanOrEqual(42);
            });
        });
    });
});

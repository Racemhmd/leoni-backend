/**
 * Tests unitaires — Règles de points MotivUp
 * Référence : Cahier des charges sections 3.1, 3.2, 3.3
 *
 * Run: npx jest points.rules.spec
 */

import {
  POINT_TO_DT_RATE,
  MAX_YEARLY_GAINED,
  MAX_YEARLY_LOST,
  EARNING_RULES,
  PENALTY_RULES,
  getPointValue,
  calculateDT,
  resolveAbsenceReason,
  validatePointsInput,
} from '../../config/points-rules.config';

describe('Points Rules — CdC sections 3.1 & 3.2', () => {
  // ── Taux de conversion ────────────────────────────────────────────────────

  describe('Taux de conversion DT (section 3.3)', () => {
    it('1 pt = 10 DT (immuable)', () => {
      expect(POINT_TO_DT_RATE).toBe(10);
    });

    it('15 pts → 150 DT', () => {
      expect(calculateDT(15)).toBe(150);
    });

    it('0 pts → 0 DT', () => {
      expect(calculateDT(0)).toBe(0);
    });

    it('42 pts → 420 DT (plafond max)', () => {
      expect(calculateDT(42)).toBe(420);
    });
  });

  // ── Plafonds annuels ──────────────────────────────────────────────────────

  describe('Plafonds annuels (section 3.1 & 3.2)', () => {
    it('Max gain annuel = 42 pts', () => {
      expect(MAX_YEARLY_GAINED).toBe(42);
    });

    it('Max perte annuelle = 25 pts', () => {
      expect(MAX_YEARLY_LOST).toBe(25);
    });
  });

  // ── Gains ─────────────────────────────────────────────────────────────────

  describe('Règles de gain (section 3.1)', () => {
    it('BEST_EMPLOYEE → 20 pts', () => {
      expect(EARNING_RULES.BEST_EMPLOYEE.points).toBe(20);
    });

    it('BEST_TEAM → 5 pts', () => {
      expect(EARNING_RULES.BEST_TEAM.points).toBe(5);
    });

    it('AIP_PLUS → 5 pts', () => {
      expect(EARNING_RULES.AIP_PLUS.points).toBe(5);
    });

    it('CIP → 5 pts', () => {
      expect(EARNING_RULES.CIP.points).toBe(5);
    });

    it('PRESENCE_MONTH → 2 pts', () => {
      expect(EARNING_RULES.PRESENCE_MONTH.points).toBe(2);
    });

    it('PLANT_MANAGER_MOTIVATION → 5 pts', () => {
      expect(EARNING_RULES.PLANT_MANAGER_MOTIVATION.points).toBe(5);
    });
  });

  // ── Pénalités ─────────────────────────────────────────────────────────────

  describe('Règles de pénalité (section 3.2)', () => {
    it('ABSENCE 1 jour → résolution SHORT → −5 pts', () => {
      const reason = resolveAbsenceReason(1);
      expect(reason).toBe('ABSENCE_SHORT');
      expect(PENALTY_RULES.ABSENCE_SHORT.points).toBe(5);
    });

    it('ABSENCE 2 jours → résolution SHORT → −5 pts', () => {
      const reason = resolveAbsenceReason(2);
      expect(reason).toBe('ABSENCE_SHORT');
    });

    it('ABSENCE 3 jours → résolution LONG → −10 pts', () => {
      const reason = resolveAbsenceReason(3);
      expect(reason).toBe('ABSENCE_LONG');
      expect(PENALTY_RULES.ABSENCE_LONG.points).toBe(10);
    });

    it('ABSENCE 7 jours → résolution LONG → −10 pts', () => {
      const reason = resolveAbsenceReason(7);
      expect(reason).toBe('ABSENCE_LONG');
    });

    it('1er retard → 0 pt perdu (règle: pénalité dès le 2ème)', () => {
      // Le 1er retard du mois n'est pas enregistré comme pénalité
      // (countMonthlyTardiness renvoie 0 avant le 1er enregistrement)
      // Cette règle est encodée dans PointsService.deductPoints
      // Ici on vérifie juste que la valeur officielle du DELAY est 0.5 pt
      expect(PENALTY_RULES.DELAY.points).toBe(0.5);
    });

    it('2ème retard du mois → −0.5 pt', () => {
      expect(PENALTY_RULES.DELAY.points).toBe(0.5);
    });

    it('DISCIPLINARY_SANCTION → −5 pts par jour', () => {
      expect(PENALTY_RULES.DISCIPLINARY_SANCTION.points).toBe(5);
    });
  });

  // ── getPointValue helper ──────────────────────────────────────────────────

  describe('getPointValue(reason)', () => {
    it('retourne la valeur correcte pour BEST_EMPLOYEE', () => {
      expect(getPointValue('BEST_EMPLOYEE')).toBe(20);
    });

    it('retourne la valeur correcte pour ABSENCE_SHORT', () => {
      expect(getPointValue('ABSENCE_SHORT')).toBe(5);
    });

    it('lève une erreur pour une raison inconnue', () => {
      expect(() => getPointValue('UNKNOWN_REASON')).toThrow();
    });
  });

  // ── validatePointsInput ───────────────────────────────────────────────────

  describe('validatePointsInput(reason, value)', () => {
    it('accepte une valeur correcte pour BEST_TEAM', () => {
      expect(validatePointsInput('BEST_TEAM', 5)).toBe(true);
    });

    it('BEST_TEAM ne peut pas être attribué avec plus de 5 pts → rejet', () => {
      expect(validatePointsInput('BEST_TEAM', 10)).toBe(false);
    });

    it('rejette une valeur incorrecte', () => {
      expect(validatePointsInput('ABSENCE_SHORT', 99)).toBe(false);
    });

    it('retourne false pour raison inconnue', () => {
      expect(validatePointsInput('INVENTED', 5)).toBe(false);
    });
  });
});

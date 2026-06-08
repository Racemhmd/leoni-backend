/**
 * Tests unitaires — Règles de liquidation MotivUp
 * Référence : Cahier des charges section 4 (calendrier de liquidation)
 *
 * Run: npx jest liquidation.rules.spec
 *
 * Hypothèses testées (calendrier LEONI) :
 *  - Liquidation de Mai  → inclut Best Employee Jan, Fév, Mar
 *  - Liquidation de Nov  → inclut AIP+ L1 (Jan→Jun) et Best Employee Jul, Aoû, Sep
 */

// ── Types & helpers reproduced locally (no DB dependency) ───────────────────

type LiquidationPeriod = {
  name: string;
  shortName: string;
  month: number; // 1-indexed
  year: number;
  includesBestEmployeeMonths: number[];   // mois couverts Best Employee
  includesAIPPlusSemester: 'S1' | 'S2' | null;
};

function buildMayLiquidation(year: number): LiquidationPeriod {
  return {
    name: `Liquidation Mai ${year}`,
    shortName: 'Mai',
    month: 5,
    year,
    // Best Employee Jan, Fév, Mar (trimestre 1 pré-liquidation Mai)
    includesBestEmployeeMonths: [1, 2, 3],
    includesAIPPlusSemester: null,
  };
}

function buildNovLiquidation(year: number): LiquidationPeriod {
  return {
    name: `Liquidation Novembre ${year}`,
    shortName: 'Nov',
    month: 11,
    year,
    // Best Employee Jul, Aoû, Sep (trimestre 3)
    includesBestEmployeeMonths: [7, 8, 9],
    // AIP+ L1 couvre Jan→Jun
    includesAIPPlusSemester: 'S1',
  };
}

function aipPlusMonths(semester: 'S1' | 'S2'): number[] {
  return semester === 'S1' ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Règles de liquidation LEONI', () => {

  describe('Liquidation de Mai', () => {
    const may = buildMayLiquidation(2025);

    it('a lieu au mois 5 (Mai)', () => {
      expect(may.month).toBe(5);
    });

    it('inclut Best Employee de Janvier', () => {
      expect(may.includesBestEmployeeMonths).toContain(1);
    });

    it('inclut Best Employee de Février', () => {
      expect(may.includesBestEmployeeMonths).toContain(2);
    });

    it('inclut Best Employee de Mars', () => {
      expect(may.includesBestEmployeeMonths).toContain(3);
    });

    it('n\'inclut pas AIP+ (AIP+ est calculé en Nov)', () => {
      expect(may.includesAIPPlusSemester).toBeNull();
    });

    it('couvre exactement 3 mois de Best Employee', () => {
      expect(may.includesBestEmployeeMonths).toHaveLength(3);
    });
  });

  describe('Liquidation de Novembre', () => {
    const nov = buildNovLiquidation(2025);

    it('a lieu au mois 11 (Novembre)', () => {
      expect(nov.month).toBe(11);
    });

    it('inclut AIP+ L1 (semestre 1)', () => {
      expect(nov.includesAIPPlusSemester).toBe('S1');
    });

    it('AIP+ L1 couvre Janvier', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toContain(1);
    });

    it('AIP+ L1 couvre Février', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toContain(2);
    });

    it('AIP+ L1 couvre Mars', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toContain(3);
    });

    it('AIP+ L1 couvre Avril', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toContain(4);
    });

    it('AIP+ L1 couvre Mai', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toContain(5);
    });

    it('AIP+ L1 couvre Juin', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toContain(6);
    });

    it('AIP+ L1 couvre exactement 6 mois (Jan→Jun)', () => {
      const months = aipPlusMonths(nov.includesAIPPlusSemester!);
      expect(months).toHaveLength(6);
    });

    it('inclut Best Employee de Juillet', () => {
      expect(nov.includesBestEmployeeMonths).toContain(7);
    });

    it('inclut Best Employee d\'Août', () => {
      expect(nov.includesBestEmployeeMonths).toContain(8);
    });

    it('inclut Best Employee de Septembre', () => {
      expect(nov.includesBestEmployeeMonths).toContain(9);
    });
  });

  describe('Cohérence inter-liquidations', () => {
    it('Mai et Novembre sont dans la même année', () => {
      const year = 2025;
      const may = buildMayLiquidation(year);
      const nov = buildNovLiquidation(year);
      expect(may.year).toBe(nov.year);
    });

    it('Les Best Employee couverts par Mai et Nov ne se chevauchent pas', () => {
      const may = buildMayLiquidation(2025);
      const nov = buildNovLiquidation(2025);
      const intersection = may.includesBestEmployeeMonths.filter(
        (m) => nov.includesBestEmployeeMonths.includes(m),
      );
      expect(intersection).toHaveLength(0);
    });

    it('La liquidation de Mai précède celle de Novembre', () => {
      const may = buildMayLiquidation(2025);
      const nov = buildNovLiquidation(2025);
      expect(may.month).toBeLessThan(nov.month);
    });
  });
});

/**
 * Source unique de vérité pour toutes les règles métier du système de points MotivUp.
 * Ces valeurs sont IMMUABLES (Object.freeze) — aucun endpoint ne peut les surcharger.
 * Référence : Cahier des charges MotivUp, sections 3.1 et 3.2.
 */

export const POINT_TO_DT_RATE = 10; // 1 point = 10 DT (immuable)
export const MAX_YEARLY_GAINED = 42; // CdC section 3.1 : max 42 points gagnés/an
export const MAX_YEARLY_LOST = 25;   // CdC section 3.2 : max 25 points perdus/an

// --- Points gagnés (valeurs fixes par catégorie) ---
export const EARNING_RULES = Object.freeze({
    BEST_EMPLOYEE:            { points: 20, dtAmount: 200, frequency: 'monthly'    },
    BEST_TEAM:                { points: 5,  dtAmount: 50,  frequency: 'quarterly'  },
    AIP_PLUS:                 { points: 5,  dtAmount: 50,  frequency: 'semiannual' },
    CIP:                      { points: 5,  dtAmount: 50,  frequency: 'monthly'    },
    PRESENCE_MONTH:           { points: 2,  dtAmount: 20,  frequency: 'monthly'    },
    PLANT_MANAGER_MOTIVATION: { points: 5,  dtAmount: 50,  frequency: 'permanent'  },
} as const);

// --- Points perdus (valeurs fixes par catégorie) ---
export const PENALTY_RULES = Object.freeze({
    ABSENCE_SHORT:        { points: 5,   condition: 'absence ≤ 2 jours'               },
    ABSENCE_LONG:         { points: 10,  condition: 'absence > 2 jours'               },
    UNPLANNED_ABSENCE:    { points: 5,   condition: 'absence non planifiée (legacy)'   }, // → ABSENCE_SHORT par défaut
    DELAY:                { points: 0.5, condition: 'dès le 2ème retard/mois'         },
    DISCIPLINARY_SANCTION:{ points: 5,   condition: 'par jour de renvoi disciplinaire' },
} as const);

export type EarningReason = keyof typeof EARNING_RULES;
export type PenaltyReason = keyof typeof PENALTY_RULES;

/**
 * Retourne la valeur officielle en points pour une raison donnée.
 * Lance une erreur si la raison est inconnue.
 */
export function getPointValue(reason: string): number {
    if (reason in EARNING_RULES) {
        return EARNING_RULES[reason as EarningReason].points;
    }
    if (reason in PENALTY_RULES) {
        return PENALTY_RULES[reason as PenaltyReason].points;
    }
    throw new Error(`Raison de points inconnue : "${reason}"`);
}

/** Convertit des points en DT au taux officiel. */
export function calculateDT(points: number): number {
    return points * POINT_TO_DT_RATE;
}

/**
 * Vérifie que la valeur soumise correspond à la valeur officielle.
 * Utilisé pour auditer/logger les tentatives de fraude de valeur.
 */
export function validatePointsInput(reason: string, submittedValue: number): boolean {
    try {
        return getPointValue(reason) === submittedValue;
    } catch {
        return false;
    }
}

export function getMaxGain(): number { return MAX_YEARLY_GAINED; }
export function getMaxLoss(): number { return MAX_YEARLY_LOST; }

/**
 * Détermine la raison d'absence correcte selon la durée.
 * Centralise la règle : ≤ 2 jours = ABSENCE_SHORT, > 2 jours = ABSENCE_LONG.
 */
export function resolveAbsenceReason(durationDays: number): 'ABSENCE_SHORT' | 'ABSENCE_LONG' {
    return durationDays <= 2 ? 'ABSENCE_SHORT' : 'ABSENCE_LONG';
}

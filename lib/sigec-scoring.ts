import scoringSource from '@/config/sigec-provisional-scoring.json'

export type SigecScoringUnit = 'item' | 'hours'

export type SigecScoringCategory = {
  code: string
  label: string
  unit: SigecScoringUnit
  unitSize: number
  pointsPerUnit: number
  maxPoints: number
}

export type SigecProvisionalScoringConfig = {
  version: string
  status: 'provisional_product_approved'
  officialPublicationAllowed: false
  groupCode: string
  groupLabel: string
  maxPoints: number
  validityYears: number | null
  validityYearsSuggestion: number
  categories: SigecScoringCategory[]
  rules: Record<string, boolean>
}

export const SIGEC_PROVISIONAL_SCORING = scoringSource as SigecProvisionalScoringConfig

export type SigecProductionEvidenceTotals = Record<string, number>

export type SigecProductionScoreResult = {
  total: number
  byCategory: Record<string, number>
  configVersion: string
  officialPublicationAllowed: false
}

/**
 * Calcula apenas a rubrica provisória aprovada pelo produto.
 * Os valores de entrada já devem representar comprovantes validados e sem duplicidade.
 */
export function calculateProvisionalProductionScore(
  evidenceTotals: SigecProductionEvidenceTotals
): SigecProductionScoreResult {
  const byCategory: Record<string, number> = {}

  for (const category of SIGEC_PROVISIONAL_SCORING.categories) {
    const supplied = evidenceTotals[category.code] ?? 0
    if (!Number.isFinite(supplied) || supplied < 0) {
      throw new Error(`Quantidade inválida para o critério ${category.code}.`)
    }

    const completeUnits = Math.floor(supplied / category.unitSize)
    byCategory[category.code] = Math.min(
      completeUnits * category.pointsPerUnit,
      category.maxPoints
    )
  }

  const total = Math.min(
    Object.values(byCategory).reduce((sum, points) => sum + points, 0),
    SIGEC_PROVISIONAL_SCORING.maxPoints
  )

  return {
    total,
    byCategory,
    configVersion: SIGEC_PROVISIONAL_SCORING.version,
    officialPublicationAllowed: false,
  }
}

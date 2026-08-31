export type SigecAudience = 'all' | 'pcd' | 'ppp' | 'pcd_or_ppp'
export type SigecAudienceFlags = { pcd: boolean; ppp: boolean }

export type SigecConditionalQuestion = {
  id: string
  config?: { audience?: SigecAudience; audienceMarker?: 'pcd' | 'ppp' }
}

export function deriveSigecAudience(
  questions: SigecConditionalQuestion[],
  answers: Record<string, unknown>,
): SigecAudienceFlags {
  return questions.reduce<SigecAudienceFlags>((flags, question) => {
    const marker = question.config?.audienceMarker
    if (marker && answers[question.id] === true) flags[marker] = true
    return flags
  }, { pcd: false, ppp: false })
}

export function matchesSigecAudience(audience: SigecAudience | undefined, flags: SigecAudienceFlags) {
  if (!audience || audience === 'all') return true
  if (audience === 'pcd') return flags.pcd
  if (audience === 'ppp') return flags.ppp
  return flags.pcd || flags.ppp
}

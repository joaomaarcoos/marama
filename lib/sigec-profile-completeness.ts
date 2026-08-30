export type SigecProfileCompletenessSource = {
  full_name: string | null
  birth_date: string | null
  whatsapp: string | null
  whatsapp_verified_at: string | null
  postal_code: string | null
  street: string | null
  address_number: string | null
  district: string | null
  city: string | null
  state: string | null
  availability: string | null
  profile_completed_at: string | null
}

export type SigecProfileCompletenessItem = {
  key: 'personal' | 'address' | 'availability' | 'whatsapp'
  label: string
  description: string
  href: string
  complete: boolean
}

const present = (value: string | null) => Boolean(value?.trim())

export function getSigecProfileCompleteness(profile: SigecProfileCompletenessSource) {
  const personalComplete = [profile.full_name, profile.birth_date, profile.whatsapp].every(present)
  const addressComplete = [
    profile.postal_code,
    profile.street,
    profile.address_number,
    profile.district,
    profile.city,
    profile.state,
  ].every(present)
  const availabilityComplete = present(profile.availability)
  const whatsappComplete = Boolean(profile.whatsapp_verified_at)

  const items: SigecProfileCompletenessItem[] = [
    {
      key: 'personal',
      label: 'Dados pessoais',
      description: personalComplete ? 'Preenchidos' : 'Complete seus dados de contato',
      href: '/minha-area/perfil',
      complete: personalComplete,
    },
    {
      key: 'address',
      label: 'Endereço',
      description: addressComplete ? 'Preenchido' : 'Informe seu endereço completo',
      href: '/minha-area/perfil',
      complete: addressComplete,
    },
    {
      key: 'availability',
      label: 'Disponibilidade',
      description: availabilityComplete ? 'Preenchida' : 'Informe quando pode trabalhar',
      href: '/minha-area/perfil',
      complete: availabilityComplete,
    },
    {
      key: 'whatsapp',
      label: 'Confirmar WhatsApp',
      description: whatsappComplete ? 'Número confirmado' : 'Confirme o código recebido',
      href: '/minha-area/verificar-whatsapp',
      complete: whatsappComplete,
    },
  ]

  const completedItems = items.filter((item) => item.complete).length

  return {
    items,
    completedItems,
    totalItems: items.length,
    percentage: Math.round((completedItems / items.length) * 100),
    informationComplete: Boolean(profile.profile_completed_at),
    ready: Boolean(profile.profile_completed_at && profile.whatsapp_verified_at),
  }
}

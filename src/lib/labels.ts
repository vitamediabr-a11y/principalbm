export const roleLabels: Record<string, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  SELLER: "Vendedor / Atendente",
  MARKETING: "Marketing / CRM",
};

export const sourceLabels: Record<string, string> = {
  PHYSICAL_STORE: "Loja física",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  WEBSITE: "Site",
  REFERRAL: "Indicação",
  EVENT: "Evento",
  OTHER: "Outro",
};

export const statusLabels: Record<string, string> = {
  CUSTOMER: "Cliente",
  RECURRING: "Recorrente",
  VIP: "VIP",
  INACTIVE: "Inativo",
  DO_NOT_CONTACT: "Não contatar",
  ARCHIVED: "Arquivado",
};

export const genderLabels: Record<string, string> = {
  FEMALE: "Feminino",
  MALE: "Masculino",
  OTHER: "Outro",
  NOT_INFORMED: "Não informado",
};

export const lifecycleEventLabels: Record<string, string> = {
  PREGNANCY_ADDED: "Gestação adicionada",
  DUE_DATE_UPDATED: "DPP atualizada",
  BIRTH_CONFIRMED: "Nascimento confirmado",
  CHILD_ADDED: "Criança adicionada",
  CHILD_UPDATED: "Dados da criança atualizados",
};

export const journeyEventLabels: Record<string, string> = {
  PREGNANCY_MONTH_5: "5º mês de gestação",
  PREGNANCY_MONTH_6: "6º mês de gestação",
  PREGNANCY_MONTH_7: "7º mês de gestação",
  PREGNANCY_MONTH_8: "8º mês de gestação",
  DPP_MINUS_60: "60 dias antes da DPP",
  DPP_MINUS_30: "30 dias antes da DPP",
  DPP_MINUS_15: "15 dias antes da DPP",
  PREGNANCY_UPDATE_REQUIRED: "Atualização da gestação necessária",
  CHILD_30_DAYS: "30 dias",
  CHILD_3_MONTHS: "3 meses",
  CHILD_6_MONTHS: "6 meses",
  CHILD_9_MONTHS: "9 meses",
  CHILD_12_MONTHS: "12 meses",
  CHILD_18_MONTHS: "18 meses",
  CHILD_2_YEARS: "2 anos",
};

export const journeyEventStatusLabels: Record<string, string> = {
  UPCOMING: "Próximo",
  DUE: "No momento",
  EXPIRED: "Expirado",
  SUPERSEDED: "Substituído",
};

export const opportunityPriorityLabels: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const opportunityStatusLabels: Record<string, string> = {
  OPEN: "Aberta",
  SNOOZED: "Adiada",
  DISMISSED: "Ignorada",
  RESOLVED: "Resolvida",
};

export const auditActionLabels: Record<string, string> = {
  "customer.created": "Cliente criado",
  "customer.updated": "Cliente atualizado",
  "pregnancy.created": "Gestação adicionada",
  "pregnancy.updated": "Gestação atualizada",
  "pregnancy.birth_confirmed": "Nascimento confirmado",
  "child.created": "Criança adicionada",
  "child.updated": "Dados da criança atualizados",
  "opportunity.created": "Oportunidade criada",
  "opportunity.snoozed": "Oportunidade adiada",
  "opportunity.dismissed": "Oportunidade ignorada",
  "opportunity.resolved": "Oportunidade resolvida",
};

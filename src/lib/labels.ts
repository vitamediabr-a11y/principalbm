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

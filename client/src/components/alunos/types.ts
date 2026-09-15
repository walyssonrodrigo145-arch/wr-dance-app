export type StudentRow = {
  id: number; name: string; email: string; phone?: string | null;
  level: string; status: string; monthlyFee: string; billingPeriodicity?: string | null; dueDay?: number | null;
  startDate?: string | null; instrumentName?: string | null;
  instrumentColor?: string | null; instrumentIcon?: string | null;
  instrumentId?: number | null;
  notes?: string | null;
  portalEnabled?: boolean;
  professorId: number;
  lessonType: string;
  avatar?: string | null;
};

export interface FormData {
  name: string;
  email: string;
  phone: string;
  instrumentId: string;
  level: "iniciante" | "intermediario" | "avancado";
  monthlyFee: string;
  billingPeriodicity: "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";
  dueDay: string;
  notes: string;
  status: "ativo" | "inativo" | "pausado";
  lessonType: "individual" | "turma" | "online";
  avatar: string;
}

export const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  phone: "",
  instrumentId: "",
  level: "iniciante",
  monthlyFee: "0",
  billingPeriodicity: "mensal",
  dueDay: "10",
  notes: "",
  status: "ativo",
  lessonType: "individual",
  avatar: "",
};
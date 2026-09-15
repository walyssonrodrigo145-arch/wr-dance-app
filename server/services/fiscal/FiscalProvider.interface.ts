export interface CompanyFiscalData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  inscricaoMunicipal?: string | null;
  inscricaoEstadual?: string | null;
  regimeTributario: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
  optanteSimplesNacional: boolean;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  codigoMunicipio?: string | null;
  telefone?: string | null;
  email?: string | null;
  apiKey?: string | null;
}

export interface CustomerFiscalData {
  personType?: "PF" | "PJ" | string | null;
  name: string;
  taxId: string; // CPF ou CNPJ
  email?: string | null;
  phone?: string | null;
  address?: {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    codigoMunicipio?: string | null;
  };
}

export interface ServiceFiscalData {
  codigoServico: string;
  codigoTributacaoMunicipio?: string | null;
  itemListaServico?: string | null;
  aliquotaIss: number;
  naturezaOperacao?: string;
  issRetido?: boolean;
  descricao: string;
}

export interface EmitNfseInput {
  reference: string;
  valor: number;
  dataEmissao?: Date;
  competencia?: string;
  company: CompanyFiscalData;
  customer: CustomerFiscalData;
  service: ServiceFiscalData;
}

export interface EmitNfseOutput {
  success: boolean;
  reference: string;
  status: "pending" | "processing" | "authorized" | "rejected" | "cancel_requested" | "cancelled" | "error";
  providerId?: string;
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface QueryNfseOutput {
  status: "pending" | "processing" | "authorized" | "rejected" | "cancel_requested" | "cancelled" | "error";
  providerId?: string;
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface CancelNfseOutput {
  success: boolean;
  status: "cancel_requested" | "cancelled" | "error";
  message?: string;
  rawResponse?: any;
}

export interface IFiscalProvider {
  name: string;
  emitNfse(input: EmitNfseInput): Promise<EmitNfseOutput>;
  queryNfse(reference: string, company: CompanyFiscalData): Promise<QueryNfseOutput>;
  cancelNfse(reference: string, reason: string, company: CompanyFiscalData): Promise<CancelNfseOutput>;
  downloadPdf(reference: string, company: CompanyFiscalData): Promise<{ buffer?: Buffer; url?: string }>;
  downloadXml(reference: string, company: CompanyFiscalData): Promise<{ content?: string; url?: string }>;
}

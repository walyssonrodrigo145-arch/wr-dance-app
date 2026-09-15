import {
  IFiscalProvider,
  EmitNfseInput,
  EmitNfseOutput,
  QueryNfseOutput,
  CancelNfseOutput,
  CompanyFiscalData,
} from "./FiscalProvider.interface";
import axios, { AxiosInstance } from "axios";

export class FocusNFeProvider implements IFiscalProvider {
  public readonly name = "focusnfe";

  private getClient(companyApiKey?: string | null): { client: AxiosInstance; baseUrl: string } {
    const apiKey = companyApiKey || process.env.FOCUS_NFE_API_KEY || "";
    const env = process.env.FOCUS_NFE_ENVIRONMENT || "development";
    
    // Test/Development URL by default, Production if explicitly configured
    const defaultBaseUrl =
      env === "production"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";
        
    const baseUrl = process.env.FOCUS_NFE_BASE_URL || defaultBaseUrl;

    const authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");

    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    return { client, baseUrl };
  }

  private cleanDoc(doc?: string | null): string {
    return (doc || "").replace(/\D/g, "");
  }

  private mapFocusStatus(focusStatus: string): "pending" | "processing" | "authorized" | "rejected" | "cancel_requested" | "cancelled" | "error" {
    const s = (focusStatus || "").toLowerCase();
    switch (s) {
      case "autorizado":
      case "emitida":
      case "concluido":
        return "authorized";
      case "processando_autorizacao":
      case "processando":
      case "enviado":
        return "processing";
      case "erro_autorizacao":
      case "rejeitado":
        return "rejected";
      case "cancelado":
        return "cancelled";
      case "processando_cancelamento":
        return "cancel_requested";
      default:
        return "pending";
    }
  }

  public async emitNfse(input: EmitNfseInput): Promise<EmitNfseOutput> {
    const { client, baseUrl } = this.getClient(input.company.apiKey);

    const prestadorDoc = this.cleanDoc(input.company.cnpj);
    const tomadorDoc = this.cleanDoc(input.customer.taxId);
    const isCpf = tomadorDoc.length <= 11;

    // Constrói payload seguro e compatível com Focus NFe v2
    const payload: Record<string, any> = {
      data_emissao: input.dataEmissao ? input.dataEmissao.toISOString() : new Date().toISOString(),
      optante_simples_nacional: input.company.optanteSimplesNacional ?? true,
      prestador: {
        cnpj: prestadorDoc,
        inscricao_municipal: input.company.inscricaoMunicipal || undefined,
        codigo_municipio: input.company.codigoMunicipio || undefined,
      },
      tomador: {
        [isCpf ? "cpf" : "cnpj"]: tomadorDoc,
        razao_social: input.customer.name,
        email: input.customer.email || undefined,
        telefone: this.cleanDoc(input.customer.phone) || undefined,
        endereco: input.customer.address
          ? {
              logradouro: input.customer.address.logradouro || undefined,
              numero: input.customer.address.numero || undefined,
              complemento: input.customer.address.complemento || undefined,
              bairro: input.customer.address.bairro || undefined,
              codigo_municipio: input.customer.address.codigoMunicipio || input.company.codigoMunicipio || undefined,
              uf: input.customer.address.uf || input.company.uf || undefined,
              cep: this.cleanDoc(input.customer.address.cep) || undefined,
            }
          : undefined,
      },
      servico: {
        valor_servicos: Number(input.valor),
        discriminacao: input.service.descricao,
        item_lista_servico: input.service.itemListaServico || "08.01",
        codigo_tributario_municipio: input.service.codigoTributacaoMunicipio || input.service.codigoServico,
        aliquota: Number(input.service.aliquotaIss || 0),
        iss_retido: input.service.issRetido ?? false,
      },
    };

    try {
      const response = await client.post(`/v2/nfse?ref=${encodeURIComponent(input.reference)}`, payload);
      const data = response.data;

      const status = this.mapFocusStatus(data.status);
      const pdfUrl = data.caminho_danfe ? (data.caminho_danfe.startsWith("http") ? data.caminho_danfe : `${baseUrl}${data.caminho_danfe}`) : undefined;
      const xmlUrl = data.caminho_xml_nota_fiscal ? (data.caminho_xml_nota_fiscal.startsWith("http") ? data.caminho_xml_nota_fiscal : `${baseUrl}${data.caminho_xml_nota_fiscal}`) : undefined;

      return {
        success: true,
        reference: input.reference,
        status,
        providerId: data.chave || data.numero || input.reference,
        numero: data.numero ? String(data.numero) : undefined,
        serie: data.serie ? String(data.serie) : undefined,
        codigoVerificacao: data.codigo_verificacao || undefined,
        pdfUrl,
        xmlUrl,
        rawResponse: data,
      };
    } catch (err: any) {
      const statusResponse = err.response?.data;
      const errorMsg =
        statusResponse?.mensagem ||
        statusResponse?.erros?.[0]?.mensagem ||
        err.message ||
        "Erro de comunicação com a Focus NFe";
      const errorCode = statusResponse?.codigo || String(err.response?.status || "API_ERROR");

      return {
        success: false,
        reference: input.reference,
        status: "error",
        errorCode,
        errorMessage: errorMsg,
        rawResponse: statusResponse,
      };
    }
  }

  public async queryNfse(reference: string, company: CompanyFiscalData): Promise<QueryNfseOutput> {
    const { client, baseUrl } = this.getClient(company.apiKey);

    try {
      const response = await client.get(`/v2/nfse/${encodeURIComponent(reference)}?completo=1`);
      const data = response.data;

      const status = this.mapFocusStatus(data.status);
      const pdfUrl = data.caminho_danfe ? (data.caminho_danfe.startsWith("http") ? data.caminho_danfe : `${baseUrl}${data.caminho_danfe}`) : undefined;
      const xmlUrl = data.caminho_xml_nota_fiscal ? (data.caminho_xml_nota_fiscal.startsWith("http") ? data.caminho_xml_nota_fiscal : `${baseUrl}${data.caminho_xml_nota_fiscal}`) : undefined;

      const errorMsg = data.erros && data.erros.length > 0 ? data.erros.map((e: any) => e.mensagem || e).join(" | ") : data.mensagem_sefaz;

      return {
        status,
        providerId: data.chave || data.numero || reference,
        numero: data.numero ? String(data.numero) : undefined,
        serie: data.serie ? String(data.serie) : undefined,
        codigoVerificacao: data.codigo_verificacao || undefined,
        pdfUrl,
        xmlUrl,
        errorCode: data.codigo_status_sefaz || undefined,
        errorMessage: errorMsg || undefined,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        status: "error",
        errorCode: String(err.response?.status || "QUERY_ERROR"),
        errorMessage: err.response?.data?.mensagem || err.message || "Erro ao consultar NFS-e",
        rawResponse: err.response?.data,
      };
    }
  }

  public async cancelNfse(reference: string, reason: string, company: CompanyFiscalData): Promise<CancelNfseOutput> {
    const { client } = this.getClient(company.apiKey);

    try {
      const response = await client.delete(`/v2/nfse/${encodeURIComponent(reference)}`, {
        data: { justificativa: reason },
      });
      const data = response.data;
      const status = this.mapFocusStatus(data.status);

      return {
        success: true,
        status: status === "cancelled" ? "cancelled" : "cancel_requested",
        message: data.mensagem || "Cancelamento solicitado com sucesso",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        status: "error",
        message: err.response?.data?.mensagem || err.message || "Erro ao solicitar cancelamento",
        rawResponse: err.response?.data,
      };
    }
  }

  public async downloadPdf(reference: string, company: CompanyFiscalData): Promise<{ buffer?: Buffer; url?: string }> {
    const query = await this.queryNfse(reference, company);
    if (query.pdfUrl) {
      return { url: query.pdfUrl };
    }
    const { client } = this.getClient(company.apiKey);
    const response = await client.get(`/v2/nfse/${encodeURIComponent(reference)}/danfe`, { responseType: "arraybuffer" });
    return { buffer: Buffer.from(response.data) };
  }

  public async downloadXml(reference: string, company: CompanyFiscalData): Promise<{ content?: string; url?: string }> {
    const query = await this.queryNfse(reference, company);
    if (query.xmlUrl) {
      return { url: query.xmlUrl };
    }
    const { client } = this.getClient(company.apiKey);
    const response = await client.get(`/v2/nfse/${encodeURIComponent(reference)}/xml`, { responseType: "text" });
    return { content: response.data };
  }
}

import { describe, expect, it } from "vitest";
import { buildContractVariables } from "./services/contractService";

// PRD — Variáveis de contrato (endereço completo + apelidos simples estilo Emusys)
const baseInput = {
  studentName: "Alice Souza",
  studentCpf: "123.456.789-00",
  studentRg: "12.345.678-9",
  studentCep: "29900-000",
  studentStreet: "Rua Amarilis",
  studentNumber: "11",
  studentComplement: "casa 05",
  studentDistrict: "São José",
  studentCity: "Linhares",
  studentState: "ES",
  schoolName: "Escola DancePro",
  schoolCnpj: "11.222.333/0001-44",
  schoolStreet: "Av. Central",
  schoolNumber: "100",
  schoolDistrict: "Centro",
  schoolCep: "29900-100",
  schoolCity: "Linhares",
  schoolState: "ES",
  monthlyFee: "320.00",
  monthlyFeeFull: "380.00",
  lessonsPerWeek: 2,
  startDate: "2026-01-10",
  endDate: "2026-07-10",
  dueDay: "10",
  contractNumber: "000123/2026",
};

describe("buildContractVariables — endereço completo", () => {
  it("monta o endereço completo do contratante a partir dos campos estruturados", () => {
    const vars = buildContractVariables(baseInput);
    expect(vars.student_address).toBe("Rua Amarilis, 11 — casa 05 — São José — Linhares/ES — CEP 29900-000");
    expect(vars["Endereço Completo do Contratante"]).toBe(vars.student_address);
  });

  it("expõe as mesmas informações em variáveis técnicas e apelidos simples (Emusys)", () => {
    const vars = buildContractVariables(baseInput);
    expect(vars["Nome do Contratante"]).toBe("Alice Souza");
    expect(vars["CPF do Contratante"]).toBe("123.456.789-00");
    expect(vars["RG do Contratante"]).toBe("12.345.678-9");
    expect(vars["Logradouro do Contratante"]).toBe("Rua Amarilis");
    expect(vars["Número do Endereço do Contratante"]).toBe("11");
    expect(vars["Bairro do Contratante"]).toBe("São José");
    expect(vars["CEP do Contratante"]).toBe("29900-000");
    expect(vars["Cidade do Contratante"]).toBe("Linhares");
    expect(vars["Estado do Contratante"]).toBe("ES");
    expect(vars["Razão Social da Escola"]).toBe("Escola DancePro");
    expect(vars["CNPJ da Escola"]).toBe("11.222.333/0001-44");
    expect(vars["Cidade da Escola"]).toBe("Linhares");
    expect(vars["Estado da Escola"]).toBe("ES");
    expect(vars["Cidade da Escola - Estado da Escola"]).toBe("Linhares - ES");
  });

  it("monta o endereço completo da escola com fallback para o texto livre", () => {
    const vars = buildContractVariables(baseInput);
    expect(vars.school_address).toBe("Av. Central, 100 — Centro — Linhares/ES — CEP 29900-100");

    const semEstruturado = buildContractVariables({ ...baseInput, schoolStreet: null, schoolNumber: null, schoolDistrict: null, schoolCep: null, schoolAddress: "Rua Antiga, 50" });
    expect(semEstruturado.school_address).toBe("Rua Antiga, 50, Linhares");
  });

  it("calcula meses de aula, datas por extenso e quantidade de aulas", () => {
    const vars = buildContractVariables(baseInput);
    expect(vars.contract_start_date).toBe("10/01/2026");
    expect(vars.contract_end_date).toBe("10/07/2026");
    expect(vars.contract_months).toBe("6");
    expect(vars["Meses de aula"]).toBe("6");
    expect(vars["Meses de pagamento"]).toBe("6");
    // 6 meses × 2 aulas/semana × 4 semanas
    expect(vars.contract_lessons_total).toBe("48");
    expect(vars["Quantidade de Aulas no Total"]).toBe("48");
    expect(vars.contract_start_date_long).toBe("10 de janeiro de 2026");
    expect(vars.contract_end_date_long).toBe("10 de julho de 2026");
  });

  it("preenche valores e número do contrato", () => {
    const vars = buildContractVariables(baseInput);
    expect(vars.monthly_fee).toBe("320.00");
    expect(vars["Valor da Parcela sem Desconto"]).toBe("380.00");
    expect(vars["Número do Contrato de Adesão"]).toBe("000123/2026");
    expect(vars["Ano Atual"]).toMatch(/^\d{4}$/);
    expect(vars["Data de hoje Por Extenso"]).toMatch(/^\d{1,2} de [a-zç]+ de \d{4}$/);
  });

  it("usa placeholders quando os dados não existem (nunca deixa {{ }} vazio quebrar o contrato)", () => {
    const vars = buildContractVariables({ studentName: "Sem Dados" });
    expect(vars.student_cpf).toBe("__________");
    expect(vars["CEP do Contratante"]).toBe("__________");
    expect(vars.contract_months).toBe("____");
    expect(vars["Quantidade de Aulas no Total"]).toBe("____");
    expect(vars.instrument).toBe("dança");
  });

  it("não calcula aulas totais quando o plano não tem aulas/semana", () => {
    const vars = buildContractVariables({ ...baseInput, lessonsPerWeek: null });
    expect(vars.contract_months).toBe("6");
    expect(vars.contract_lessons_total).toBe("____");
  });
});

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  Receipt,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  Pencil,
  Save,
  AlertTriangle,
  Loader2,
  Layers,
  Eye,
  EyeOff,
  Key,
  Phone,
  Mail,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sanitizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

const EMPTY_SERVICE_FORM = {
  nome: "",
  codigoServico: "",
  codigoTributacaoMunicipio: "",
  itemListaServico: "08.01",
  aliquotaIss: "0.00",
  naturezaOperacao: "1",
  descricaoPadrao: "Mensalidade referente a aulas de musica - Competencia {competencia}",
  issRetido: false,
  ativo: true,
};

// ─── Component ────────────────────────────────────────────────────────────────
export function ConfigFiscalTab() {
  const utils = trpc.useUtils();
  const { data: company, isLoading: isLoadingCompany } = trpc.fiscal.company.get.useQuery();
  const { data: services = [], isLoading: isLoadingServices } = trpc.fiscal.services.list.useQuery();

  const [showApiKey, setShowApiKey] = useState(false);

  const [form, setForm] = useState({
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    inscricaoMunicipal: "",
    inscricaoEstadual: "",
    regimeTributario: "simples_nacional" as "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei",
    optanteSimplesNacional: true,
    tipoEmissaoNfse: "automatico" as "municipal" | "nacional" | "automatico",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "SP",
    codigoMunicipio: "",
    telefone: "",
    email: "",
    focusApiKey: "",
    autoEmitOnPayment: false,
    emitTiming: "imediato",
    autoEmailInvoice: true,
    autoRetryErrors: true,
  });

  // Modal de Serviço
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE_FORM);

  useEffect(() => {
    if (company) {
      setForm({
        cnpj: company.cnpj || "",
        razaoSocial: company.razaoSocial || "",
        nomeFantasia: company.nomeFantasia || "",
        inscricaoMunicipal: company.inscricaoMunicipal || "",
        inscricaoEstadual: company.inscricaoEstadual || "",
        regimeTributario: (company.regimeTributario as any) || "simples_nacional",
        optanteSimplesNacional: company.optanteSimplesNacional ?? true,
        tipoEmissaoNfse: (company.tipoEmissaoNfse as any) || "automatico",
        cep: company.cep || "",
        logradouro: company.logradouro || "",
        numero: company.numero || "",
        complemento: company.complemento || "",
        bairro: company.bairro || "",
        cidade: company.cidade || "",
        uf: company.uf || "SP",
        codigoMunicipio: company.codigoMunicipio || "",
        telefone: company.telefone || "",
        email: company.email || "",
        focusApiKey: company.focusApiKey || "",
        autoEmitOnPayment: company.autoEmitOnPayment ?? false,
        emitTiming: company.emitTiming || "imediato",
        autoEmailInvoice: company.autoEmailInvoice ?? true,
        autoRetryErrors: company.autoRetryErrors ?? true,
      });
    }
  }, [company]);

  const saveCompanyMutation = trpc.fiscal.company.save.useMutation({
    onSuccess: () => {
      toast.success("Configurações fiscais salvas com sucesso!");
      utils.fiscal.company.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createServiceMutation = trpc.fiscal.services.create.useMutation({
    onSuccess: () => {
      toast.success("Serviço fiscal cadastrado!");
      setServiceModalOpen(false);
      utils.fiscal.services.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateServiceMutation = trpc.fiscal.services.update.useMutation({
    onSuccess: () => {
      toast.success("Serviço fiscal atualizado!");
      setServiceModalOpen(false);
      utils.fiscal.services.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteServiceMutation = trpc.fiscal.services.delete.useMutation({
    onSuccess: () => {
      toast.success("Serviço fiscal excluído!");
      utils.fiscal.services.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSaveCompany = () => {
    const cnpjClean = sanitizeCnpj(form.cnpj);
    if (!cnpjClean || cnpjClean.length < 14) {
      toast.error("Informe um CNPJ válido (14 dígitos)");
      return;
    }
    if (!form.razaoSocial.trim()) {
      toast.error("Informe a Razão Social da escola");
      return;
    }
    if (!form.focusApiKey.trim()) {
      toast.error("Informe a API Key da Focus NFe para habilitar a emissão");
      return;
    }
    saveCompanyMutation.mutate({ ...form, cnpj: cnpjClean });
  };

  const handleSaveService = () => {
    if (!serviceForm.nome || !serviceForm.codigoServico) {
      toast.error("Preencha o nome e o código do serviço");
      return;
    }
    if (editingServiceId) {
      updateServiceMutation.mutate({ id: editingServiceId, ...serviceForm });
    } else {
      createServiceMutation.mutate(serviceForm);
    }
  };

  const handleOpenEditService = (srv: any) => {
    setEditingServiceId(srv.id);
    setServiceForm({
      nome: srv.nome,
      codigoServico: srv.codigoServico,
      codigoTributacaoMunicipio: srv.codigoTributacaoMunicipio || "",
      itemListaServico: srv.itemListaServico || "08.01",
      aliquotaIss: String(srv.aliquotaIss || "0.00"),
      naturezaOperacao: srv.naturezaOperacao || "1",
      descricaoPadrao: srv.descricaoPadrao,
      issRetido: srv.issRetido,
      ativo: srv.ativo,
    });
    setServiceModalOpen(true);
  };

  const handleOpenNewService = () => {
    setEditingServiceId(null);
    setServiceForm(EMPTY_SERVICE_FORM); // ← FIX: sempre reseta para o form limpo
    setServiceModalOpen(true);
  };

  // ─── Indicadores de completude ─────────────────────────────────────────────
  const isMissingApiKey = !form.focusApiKey.trim();
  const isMissingCnpj = sanitizeCnpj(form.cnpj).length < 14;
  const isMissingIM = !form.inscricaoMunicipal.trim();
  const hasConfigWarning = isMissingApiKey || isMissingCnpj || isMissingIM;

  if (isLoadingCompany) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="animate-spin inline mr-2 text-emerald-500" size={24} />
        Carregando configurações fiscais...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">

      {/* ─── Banner de configuração incompleta ───────────────────────────────── */}
      {hasConfigWarning && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
              <AlertTriangle size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-500">Configuração Fiscal Incompleta</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {isMissingCnpj && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 font-bold">
                    CNPJ ausente
                  </span>
                )}
                {isMissingIM && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 font-bold">
                    Inscrição Municipal ausente
                  </span>
                )}
                {isMissingApiKey && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-500 font-bold">
                    API Key Focus NFe ausente (obrigatória)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 1. Dados da Empresa ─────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-border/60 pb-3">
          <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-500">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground">Dados Fiscais da Escola (Prestador)</h3>
            <p className="text-xs text-muted-foreground">
              Informações cadastrais e endereço da pessoa jurídica emissora da NFS-e.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* CNPJ com máscara */}
          <div>
            <Label className="text-xs font-bold">CNPJ *</Label>
            <Input
              value={maskCnpj(form.cnpj)}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Razão Social *</Label>
            <Input
              value={form.razaoSocial}
              onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
              placeholder="Ex: Escola de Música Harmonia LTDA"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Nome Fantasia</Label>
            <Input
              value={form.nomeFantasia}
              onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })}
              placeholder="Ex: WR Music Pro"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Inscrição Municipal *</Label>
            <Input
              value={form.inscricaoMunicipal}
              onChange={(e) => setForm({ ...form, inscricaoMunicipal: e.target.value })}
              placeholder="Ex: 1234567-8"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Inscrição Estadual</Label>
            <Input
              value={form.inscricaoEstadual}
              onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })}
              placeholder="Isento ou número"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Código Município (IBGE)</Label>
            <Input
              value={form.codigoMunicipio}
              onChange={(e) => setForm({ ...form, codigoMunicipio: e.target.value })}
              placeholder="Ex: 3550308 (São Paulo)"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
            />
          </div>

          {/* Telefone e Email da empresa */}
          <div>
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <Phone size={12} className="text-muted-foreground" /> Telefone
            </Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              placeholder="(11) 99999-9999"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <Mail size={12} className="text-muted-foreground" /> E-mail da Empresa
            </Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="fiscal@suaescola.com.br"
              type="email"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>
        </div>

        {/* Endereço */}
        <div className="pt-3 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <Label className="text-xs font-bold">CEP</Label>
            <Input
              value={form.cep}
              onChange={(e) => setForm({ ...form, cep: e.target.value })}
              placeholder="00000-000"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
            />
          </div>

          <div className="lg:col-span-2">
            <Label className="text-xs font-bold">Logradouro / Rua</Label>
            <Input
              value={form.logradouro}
              onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
              placeholder="Av. Paulista"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Número</Label>
            <Input
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
              placeholder="1000"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Complemento</Label>
            <Input
              value={form.complemento}
              onChange={(e) => setForm({ ...form, complemento: e.target.value })}
              placeholder="Sala 42"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Bairro</Label>
            <Input
              value={form.bairro}
              onChange={(e) => setForm({ ...form, bairro: e.target.value })}
              placeholder="Bela Vista"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">Cidade</Label>
            <Input
              value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              placeholder="São Paulo"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
            />
          </div>

          <div>
            <Label className="text-xs font-bold">UF (Estado)</Label>
            <Input
              value={form.uf}
              onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
              maxLength={2}
              placeholder="SP"
              className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-bold uppercase"
            />
          </div>
        </div>
      </div>

      {/* ─── 2. API Key Focus NFe ──────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-border/60 pb-3">
          <div className="p-2 rounded-2xl bg-rose-500/10 text-rose-500">
            <Key size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-foreground">Credenciais Focus NFe</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                🧪 Ambiente de Homologação / Testes
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chave de API do ambiente de testes para simular emissão de notas fiscais via Focus NFe.{" "}
              <a
                href="https://focusnfe.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 underline-offset-2 hover:underline"
              >
                Painel Focus NFe →
              </a>
            </p>
          </div>
        </div>

        <div className="relative">
          <Label className="text-xs font-bold">API Token / Secret Key (Homologação) *</Label>
          <div className="relative mt-1.5">
            <Input
              value={form.focusApiKey}
              onChange={(e) => setForm({ ...form, focusApiKey: e.target.value })}
              type={showApiKey ? "text" : "password"}
              placeholder="Ex: cPzdMhCTVuAnOXiKJjb8Wl..."
              className="h-11 rounded-2xl bg-background border-border text-xs font-mono pr-12"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Obtenha a chave em <b>Painel Focus NFe → Configurações → API Tokens</b>. Use o token de <b>Homologação</b> para emitir notas de teste sem gerar cobrança de impostos reais.
          </span>
        </div>
      </div>

      {/* ─── 3. Regime Tributário & NFS-e ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Regime Tributário */}
        <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 text-xs">
          <div className="flex items-center gap-3 border-b border-border/60 pb-3">
            <div className="p-2 rounded-2xl bg-blue-500/10 text-blue-400">
              <Receipt size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">Regime Tributário</h3>
              <p className="text-xs text-muted-foreground">Configuração para cálculo correto de alíquotas.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Regime Tributário</Label>
            <Select
              value={form.regimeTributario}
              onValueChange={(val: any) => setForm({ ...form, regimeTributario: val })}
            >
              <SelectTrigger className="mt-1.5 h-11 rounded-2xl border-border bg-background font-medium text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border bg-card">
                <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                <SelectItem value="mei">Microempreendedor Individual (MEI)</SelectItem>
                <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                <SelectItem value="lucro_real">Lucro Real</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* FIX: layout do toggle em mobile — min-w-0 no texto, shrink-0 no switch */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/20 border border-border">
            <div className="flex-1 min-w-0">
              <Label className="text-xs font-bold block">Optante pelo Simples Nacional?</Label>
              <span className="text-[10px] text-muted-foreground leading-relaxed">
                Gera campo <span className="font-mono">optante_simples_nacional</span> na NFS-e
              </span>
            </div>
            <Switch
              checked={form.optanteSimplesNacional}
              onCheckedChange={(val) => setForm({ ...form, optanteSimplesNacional: val })}
              className="shrink-0"
            />
          </div>
        </div>

        {/* Tipo de Emissão NFS-e & Certificado */}
        <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 text-xs">
          <div className="flex items-center gap-3 border-b border-border/60 pb-3">
            <div className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">Padrão NFS-e & Certificado</h3>
              <p className="text-xs text-muted-foreground">Modelo de transmissão municipal/nacional.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Padrão de Emissão</Label>
            <Select
              value={form.tipoEmissaoNfse}
              onValueChange={(val: any) => setForm({ ...form, tipoEmissaoNfse: val })}
            >
              <SelectTrigger className="mt-1.5 h-11 rounded-2xl border-border bg-background font-medium text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border bg-card">
                <SelectItem value="automatico">Automático (Recomendado)</SelectItem>
                <SelectItem value="municipal">NFS-e Municipal (Prefeitura)</SelectItem>
                <SelectItem value="nacional">NFS-e Nacional (Padrão Gov)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* FIX: layout do card de certificado — flex-wrap para não transbordar */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-xs">Certificado Digital A1</p>
                <p className="text-[10px] text-muted-foreground">Focus NFe Cloud / Conectado</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-bold h-8 border-border shrink-0"
            >
              Atualizar Certificado
            </Button>
          </div>
        </div>
      </div>

      {/* ─── 4. Gestão de Serviços Fiscais ────────────────────────────────────── */}
      <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4">
        {/* FIX: header do serviço — botão responsivo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-2xl bg-purple-500/10 text-purple-400 shrink-0">
              <Layers size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-foreground">Serviços Fiscais Cadastrados</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cadastre os códigos de serviço municipais utilizados nas notas fiscais de mensalidades e cursos.
              </p>
            </div>
          </div>

          <Button
            onClick={handleOpenNewService}
            className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-4 text-xs gap-1.5 w-full sm:w-auto shrink-0"
          >
            <Plus size={16} /> Novo Serviço
          </Button>
        </div>

        {isLoadingServices ? (
          <div className="py-6 text-center text-muted-foreground text-xs">
            <Loader2 className="animate-spin inline mr-2 text-purple-400" size={18} />
            Carregando serviços...
          </div>
        ) : services.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs">
            Nenhum serviço fiscal configurado. Clique em &quot;Novo Serviço&quot; para cadastrar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map((srv: any) => (
              <div
                key={srv.id}
                className="p-4 rounded-2xl border border-border bg-background flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground text-sm">{srv.nome}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">
                      Cód: {srv.codigoServico}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                    {srv.descricaoPadrao}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2 font-medium">
                    <span>ISS: {srv.aliquotaIss}%</span>
                    <span>Item LC 116: {srv.itemListaServico || "08.01"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEditService(srv)}
                    className="h-8 w-8 rounded-lg hover:bg-muted"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteServiceMutation.mutate({ id: srv.id })}
                    className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 5. Automações & Notificações ─────────────────────────────────────── */}
      <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 text-xs">
        <div className="flex items-center gap-3 border-b border-border/60 pb-3">
          <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-500">
            <Zap size={20} />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground">Automação de Emissão</h3>
            <p className="text-xs text-muted-foreground">Regras de disparo automático após pagamentos.</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Toggle: Emitir automaticamente */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/20 border border-border">
            <div className="flex-1 min-w-0">
              <Label className="text-xs font-bold block">Emitir NFS-e automaticamente após pagamento</Label>
              <span className="text-[10px] text-muted-foreground leading-relaxed">
                Gera a solicitação na fila fiscal assim que o pagamento da mensalidade for confirmado.
              </span>
            </div>
            <Switch
              checked={form.autoEmitOnPayment}
              onCheckedChange={(val) => setForm({ ...form, autoEmitOnPayment: val })}
              className="shrink-0"
            />
          </div>

          {/* Timing de emissão — agora com UI */}
          {form.autoEmitOnPayment && (
            <div className="p-4 rounded-2xl bg-muted/10 border border-border space-y-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Clock size={12} className="text-muted-foreground" /> Timing de Emissão
              </Label>
              <Select
                value={form.emitTiming}
                onValueChange={(val) => setForm({ ...form, emitTiming: val })}
              >
                <SelectTrigger className="h-10 rounded-xl border-border bg-background font-medium text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border bg-card">
                  <SelectItem value="imediato">Imediatamente após confirmação</SelectItem>
                  <SelectItem value="proximo_dia_util">Próximo dia útil</SelectItem>
                  <SelectItem value="fim_do_mes">Ao final do mês</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                Define quando a nota será enviada para a prefeitura após o pagamento.
              </span>
            </div>
          )}

          {/* Toggle: Enviar por email */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/20 border border-border">
            <div className="flex-1 min-w-0">
              <Label className="text-xs font-bold block">Enviar nota fiscal por e-mail ao aluno</Label>
              <span className="text-[10px] text-muted-foreground leading-relaxed">
                Dispara o link do PDF/XML assim que a nota for autorizada pela prefeitura.
              </span>
            </div>
            <Switch
              checked={form.autoEmailInvoice}
              onCheckedChange={(val) => setForm({ ...form, autoEmailInvoice: val })}
              className="shrink-0"
            />
          </div>

          {/* Toggle: Reprocessamento automático */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/20 border border-border">
            <div className="flex-1 min-w-0">
              <Label className="text-xs font-bold block">Reprocessamento automático com backoff</Label>
              <span className="text-[10px] text-muted-foreground leading-relaxed">
                Tenta retransmitir automaticamente em caso de instabilidade na prefeitura.
              </span>
            </div>
            <Switch
              checked={form.autoRetryErrors}
              onCheckedChange={(val) => setForm({ ...form, autoRetryErrors: val })}
              className="shrink-0"
            />
          </div>
        </div>
      </div>

      {/* ─── Botão Salvar ────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          onClick={handleSaveCompany}
          disabled={saveCompanyMutation.isPending}
          className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 px-8 text-xs shadow-lg shadow-emerald-950/20 gap-2"
        >
          {saveCompanyMutation.isPending ? (
            <>
              <Loader2 className="animate-spin" size={16} /> Salvando...
            </>
          ) : (
            <>
              <Save size={16} /> Salvar Configurações Fiscais
            </>
          )}
        </Button>
      </div>

      {/* ─── Modal Criar / Editar Serviço Fiscal ──────────────────────────────── */}
      <Dialog
        open={serviceModalOpen}
        onOpenChange={(open) => {
          // FIX: reseta o form corretamente ao fechar
          if (!open) {
            setEditingServiceId(null);
            setServiceForm(EMPTY_SERVICE_FORM);
          }
          setServiceModalOpen(open);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl border-border bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <Layers className="text-emerald-500" size={20} />
              {editingServiceId ? "Editar Serviço Fiscal" : "Novo Serviço Fiscal"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs font-bold">Nome do Serviço *</Label>
              <Input
                value={serviceForm.nome}
                onChange={(e) => setServiceForm({ ...serviceForm, nome: e.target.value })}
                placeholder="Ex: Mensalidade de Aulas de Música"
                className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Código do Serviço *</Label>
                <Input
                  value={serviceForm.codigoServico}
                  onChange={(e) => setServiceForm({ ...serviceForm, codigoServico: e.target.value })}
                  placeholder="Ex: 0801 ou 08.01.01"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Alíquota ISS (%)</Label>
                <Input
                  value={serviceForm.aliquotaIss}
                  onChange={(e) => setServiceForm({ ...serviceForm, aliquotaIss: e.target.value })}
                  placeholder="2.00"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-bold"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Item Lista de Serviços (LC 116)</Label>
              <Input
                value={serviceForm.itemListaServico}
                onChange={(e) => setServiceForm({ ...serviceForm, itemListaServico: e.target.value })}
                placeholder="08.01"
                className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Descrição Padrão da NFS-e *</Label>
              <Textarea
                rows={3}
                value={serviceForm.descricaoPadrao}
                onChange={(e) => setServiceForm({ ...serviceForm, descricaoPadrao: e.target.value })}
                placeholder="Mensalidade referente às aulas de {instrumento} - Competência {competencia}"
                className="mt-1.5 rounded-2xl bg-background border-border text-xs resize-none"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Variáveis: {"{aluno}"}, {"{instrumento}"}, {"{competencia}"}, {"{valor}"}
              </span>
            </div>

            {/* ISS Retido */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/20 border border-border">
              <div className="flex-1 min-w-0">
                <Label className="text-xs font-bold block">ISS Retido na Fonte?</Label>
                <span className="text-[10px] text-muted-foreground">Gera campo issRetido=true na NFS-e</span>
              </div>
              <Switch
                checked={serviceForm.issRetido}
                onCheckedChange={(val) => setServiceForm({ ...serviceForm, issRetido: val })}
                className="shrink-0"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setServiceModalOpen(false)}
              className="rounded-2xl h-11 text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveService}
              disabled={createServiceMutation.isPending || updateServiceMutation.isPending}
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-5 text-xs shadow-lg shadow-emerald-950/20"
            >
              {createServiceMutation.isPending || updateServiceMutation.isPending ? (
                <><Loader2 className="animate-spin mr-1.5" size={14} /> Salvando...</>
              ) : (
                "Salvar Serviço"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

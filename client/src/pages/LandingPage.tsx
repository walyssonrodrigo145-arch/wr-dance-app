import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, 
  Users, 
  Calendar, 
  DollarSign, 
  BarChart3, 
  Bell, 
  Guitar, 
  Check, 
  ArrowRight, 
  Menu, 
  X,
  Star,
  Play,
  Shield,
  CreditCard,
  MapPin,
  User,
  Mail,
  Lock,
  Phone,
  ChevronRight,
  ChevronDown,
  Loader2,
  MessageCircle,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { BenefitsCarousel } from '@/components/BenefitsCarousel';
import { HeroSlider } from '@/components/HeroSlider';
import ClientsMarquee from '@/components/ClientsMarquee';
import { trpc } from '@/lib/trpc';

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
export const TRIAL_DAYS = 7;

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type PlanType = '10alunos' | '20alunos' | '30alunos' | 'basico' | 'profissional' | 'premium';
type ModalStep = 'conta' | 'endereco' | 'sucesso';

interface SignupForm {
  nome: string;
  email: string;
  senha: string;
  telefone: string;
  cpfCnpj: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

// ─── MODAL DE CADASTRO ────────────────────────────────────────────────────────
const SignupModal = ({ plan, onClose }: { plan: string; onClose: () => void }) => {
  const [step, setStep] = useState<ModalStep>('conta');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const cepAbortRef = useRef<AbortController | null>(null);
  const [form, setForm] = useState<SignupForm>({
    nome: '', email: '', senha: '', telefone: '', cpfCnpj: '',
    cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: '',
  });

  const registerMutation = trpc.auth.registerWithPlan.useMutation();

  const steps: ModalStep[] = ['conta', 'endereco'];
  const stepLabels: Record<ModalStep, string> = { conta: 'Sua Conta', endereco: 'Endereço', sucesso: 'Concluído' };
  const currentStepIdx = steps.indexOf(step as any);

  const set = (key: keyof SignupForm, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const formatCpfCnpj = (v: string) => {
    const digits = v.replace(/\D/g, '');
    if (digits.length <= 11) {
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2')
        .slice(0, 14);
    } else {
      return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
        .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, '$1-$2')
        .slice(0, 18);
    }
  };

  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatCep = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  };

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, '');
    cepAbortRef.current?.abort();
    setCepError(null);
    if (clean.length !== 8) return;

    const controller = new AbortController();
    cepAbortRef.current = controller;
    const isCurrent = () => cepAbortRef.current === controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 5000);
    setCepLoading(true);

    try {
      let addr: { street?: string; district?: string; city?: string; state?: string } | null = null;
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, { signal: controller.signal });
        const data = await res.json();
        if (!data.erro) {
          addr = { street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf };
        }
      } catch (e) {
        if (controller.signal.aborted) throw e;
      }

      // Fallback: BrasilAPI (base de dados independente da ViaCEP)
      if (!addr) {
        const res2 = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`, { signal: controller.signal });
        const data2 = await res2.json();
        if (data2 && data2.city) {
          addr = { street: data2.street, district: data2.neighborhood, city: data2.city, state: data2.state };
        }
      }

      if (!isCurrent()) return;
      if (addr && (addr.street || addr.city)) {
        set('rua', addr.street || '');
        set('bairro', addr.district || '');
        set('cidade', addr.city || '');
        set('estado', (addr.state || '').toUpperCase());
      } else {
        setCepError('CEP não encontrado — verifique o número ou preencha manualmente.');
      }
    } catch {
      if (!isCurrent()) return;
      if (timedOut) {
        setCepError('A consulta demorou demais — preencha manualmente se preferir.');
      } else if (!controller.signal.aborted) {
        setCepError('Não foi possível consultar o CEP — preencha manualmente.');
      }
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setCepLoading(false);
    }
  };

  const handleNext = async () => {
    setError(null);
    if (step === 'conta') {
      if (!form.nome || !form.email || !form.senha || !form.telefone || !form.cpfCnpj)
        return setError('Preencha todos os campos.');
      if (!form.email.includes('@')) return setError('E-mail inválido.');
      if (form.senha.length < 8) return setError('A senha deve ter no mínimo 8 caracteres.');
      const cpfDigits = form.cpfCnpj.replace(/\D/g, '');
      if (cpfDigits.length !== 11 && cpfDigits.length !== 14)
        return setError('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.');
      setStep('endereco');
    }
    else if (step === 'endereco') {
      if (!form.cep || !form.rua || !form.numero || !form.bairro || !form.cidade || !form.estado)
        return setError('Preencha todos os campos do endereço.');
      // Registrar conta e redirecionar para o checkout do Asaas
      setLoading(true);
      try {
        const result = await registerMutation.mutateAsync({
          name: form.nome,
          email: form.email,
          password: form.senha,
          phone: form.telefone,
          planType: "MONTHLY",
          planId: plan,
          cpfCnpj: form.cpfCnpj.replace(/\D/g, ''),
          address: {
            zipCode: form.cep,
            street: form.rua,
            number: form.numero,
            district: form.bairro,
            city: form.cidade,
            state: form.estado,
          },
        });

        if (result.invoiceUrl) {
          // Redirecionar diretamente para o checkout do Asaas
          window.open(result.invoiceUrl, '_blank');
          setInvoiceUrl(result.invoiceUrl);
        }
        setStep('sucesso');
      } catch (err: any) {
        setError(err.message || 'Erro ao configurar faturamento. Tente novamente.');
      } finally {
        setLoading(false);
      }
    }
  };

  // Overlay click handler (desativado o fechamento ao clicar fora para não perder dados)
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // if (e.target === e.currentTarget && step !== 'sucesso') onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative w-full max-w-lg bg-card text-card-foreground rounded-3xl shadow-2xl border border-border/50 overflow-hidden max-h-[95vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header azul */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 pt-8 pb-6 text-white">
          {step !== 'sucesso' && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          )}

          {step === 'sucesso' ? (
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={36} className="text-white" strokeWidth={3} />
              </div>
              <h2 className="text-2xl font-black mb-1">Cadastro realizado!</h2>
              <p className="text-blue-100 text-sm">Sua assinatura começará em instantes</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shadow-md overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-lg flex items-center justify-center relative z-10">
                    <div className="flex items-center gap-[2px] h-3">
                      <div className="w-[3px] bg-white/90 rounded-full h-1.5" />
                      <div className="w-[3px] bg-white/90 rounded-full h-3" />
                      <div className="w-[3px] bg-white rounded-full h-full shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
                      <div className="w-[3px] bg-white/90 rounded-full h-2" />
                    </div>
                  </div>
                </div>
                <span className="font-bold text-sm opacity-90">MusicPro</span>
              </div>
              <h2 className="text-xl font-black mb-1">
                Cadastro
              </h2>
              <p className="text-blue-100 text-xs">Acesso total • Cancele quando quiser</p>

              {/* Steps indicator */}
              <div className="flex items-center gap-2 mt-5">
                {steps.map((s, i) => (
                  <React.Fragment key={s}>
                    <div className={`flex items-center gap-1.5 ${i <= currentStepIdx ? 'text-white' : 'text-blue-300'}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                        i < currentStepIdx ? 'bg-white text-blue-600 border-white' :
                        i === currentStepIdx ? 'border-white text-white' :
                        'border-blue-400 text-blue-400'
                      }`}>
                        {i < currentStepIdx ? <Check size={12} strokeWidth={3} /> : i + 1}
                      </div>
                      <span className="text-xs font-semibold hidden sm:block">{stepLabels[s]}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 rounded-full transition-all ${i < currentStepIdx ? 'bg-white' : 'bg-blue-400/40'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Conteúdo */}
        <div className="px-8 py-6">
          <AnimatePresence mode="wait">

            {/* ── ETAPA 1: CONTA ── */}
            {step === 'conta' && (
              <motion.div key="conta" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Nome completo</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                      type="text" placeholder="Seu nome completo"
                      value={form.nome} onChange={e => set('nome', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">E-mail</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                      type="email" placeholder="seu@email.com"
                      value={form.email} onChange={e => set('email', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                      type={showPassword ? 'text' : 'password'} placeholder="Mínimo 8 caracteres"
                      value={form.senha} onChange={e => set('senha', e.target.value)}
                      className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Telefone / WhatsApp *</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                      type="tel" placeholder="(00) 00000-0000" maxLength={15}
                      value={form.telefone} onChange={e => set('telefone', formatPhone(e.target.value))}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">CPF ou CNPJ</label>
                  <div className="relative">
                    <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                      type="text" placeholder="000.000.000-00" maxLength={18}
                      value={form.cpfCnpj}
                      onChange={e => set('cpfCnpj', formatCpfCnpj(e.target.value))}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white font-mono tracking-wider"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">Necessário para emissão da cobrança</p>
                </div>
              </motion.div>
            )}

            {/* ── ETAPA 2: ENDEREÇO ── */}
            {step === 'endereco' && (
              <motion.div key="endereco" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">CEP</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                      <input
                        type="text" placeholder="00000-000" inputMode="numeric" maxLength={9}
                        value={form.cep}
                        onChange={e => { const v = formatCep(e.target.value); set('cep', v); lookupCep(v); }}
                        className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                      />
                      {cepLoading && (
                        <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
                      )}
                    </div>
                    {cepError && (
                      <p className="text-[11px] text-amber-600 font-bold mt-1" aria-live="polite">{cepError}</p>
                    )}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Estado</label>
                    <input
                      type="text" placeholder="UF" maxLength={2}
                      value={form.estado} onChange={e => set('estado', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Rua / Logradouro</label>
                  <input
                    type="text" placeholder="Rua, Avenida..."
                    value={form.rua} onChange={e => set('rua', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Número</label>
                    <input
                      type="text" placeholder="Nº"
                      value={form.numero} onChange={e => set('numero', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Bairro</label>
                    <input
                      type="text" placeholder="Bairro"
                      value={form.bairro} onChange={e => set('bairro', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Cidade</label>
                  <input
                    type="text" placeholder="Sua cidade"
                    value={form.cidade} onChange={e => set('cidade', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>
              </motion.div>
            )}


            {/* ── SUCESSO ── */}
            {step === 'sucesso' && (
              <motion.div key="sucesso" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-5">
                <div>
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={32} />
                  </div>
                  <h3 className="text-xl font-outfit font-black text-foreground mb-2">
                    Bem-vindo ao MusicPro! 🎉
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Sua conta foi criada com sucesso! Você ganhou <strong className="text-blue-600">7 dias grátis</strong> para testar a plataforma.
                  </p>
                </div>

                <div className="space-y-2">
                  <Link href="/dashboard">
                    <button className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                      Acessar minha conta <ArrowRight size={16} />
                    </button>
                  </Link>
                  <button onClick={onClose} className="w-full py-2.5 text-muted-foreground/50 text-xs hover:text-muted-foreground transition-colors">
                    Fechar
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Botão de avançar */}
          {step !== 'sucesso' && (
            <>
              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold text-center border border-red-100">
                  {error}
                </div>
              )}
              <motion.button
                key={step}
                onClick={handleNext}
                disabled={loading}
                className="mt-6 w-full py-4 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : step === 'endereco' ? (
                  <>
                    <CreditCard size={16} />
                    Confirmar Assinatura
                  </>
                ) : (
                  <>
                    Continuar <ChevronRight size={16} />
                  </>
                )}
              </motion.button>
            </>
          )}

          {step !== 'sucesso' && (
            <p className="text-center text-xs text-muted-foreground/50 mt-3 flex items-center justify-center gap-1">
              <Shield size={11} /> Dados protegidos com criptografia SSL
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── CARD DE PLANO (reuso: grid da landing + modal "ver mais planos") ─────────
const PlanCard = ({ plan, index = 0, onSelect, animate = true }: {
  plan: any;
  index?: number;
  onSelect: (planId: string) => void;
  animate?: boolean;
}) => {
  const cardClass = `relative flex flex-col rounded-[40px] transition-all duration-300 ${
    plan.highlight
      ? 'bg-card text-card-foreground border-2 border-blue-500 shadow-2xl shadow-blue-500/20 md:-translate-y-4 p-10'
      : 'bg-card/40 backdrop-blur-xl shadow-2xl shadow-primary/5 border border-border/50 hover:border-primary/30 hover:shadow-primary/20 p-10'
  }`;

  const content = (
    <>
      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-5 py-2 rounded-full shadow-lg whitespace-nowrap">
          {plan.badge}
        </div>
      )}

      {/* Plan Info */}
      <div className="mb-6">
        <h4 className={`text-2xl font-outfit font-extrabold mb-1 ${plan.highlight ? 'text-primary' : 'text-foreground'}`}>
          {plan.name}
        </h4>
        <p className={`text-sm font-medium ${plan.highlight ? 'text-primary/70' : 'text-muted-foreground'}`}>
          {plan.subtitle}
        </p>
        {plan.allowExtraStudents && plan.maxStudents < 999999 && (
          <p className={`text-xs font-semibold mt-1 ${plan.highlight ? 'text-blue-400' : 'text-primary/60'}`}>
            + R$ {plan.extraStudentPrice.toFixed(2)}/aluno adicional
          </p>
        )}
      </div>

      {/* Price */}
      <div className={`flex items-baseline gap-1 mb-8 ${plan.highlight ? 'text-primary' : 'text-foreground'}`}>
        <span className="text-base font-bold text-gray-500">R$</span>
        <span className="text-5xl font-black tracking-tight">{plan.price}</span>
        <span className="text-2xl font-black">,{plan.cents}</span>
        <span className="text-gray-400 font-medium text-sm">/mês</span>
      </div>

      {/* Features */}
      <ul className="space-y-4 mb-10 flex-1">
        {plan.features.map((feat: string) => (
          <li key={feat} className={`flex items-center gap-3 text-sm font-medium ${plan.highlight ? 'text-foreground' : 'text-muted-foreground'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              plan.highlight ? 'bg-blue-600 text-white' : 'bg-primary/10 text-primary'
            }`}>
              <Check size={13} strokeWidth={3} />
            </div>
            {feat}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={() => onSelect(plan.id)}
        className={`w-full py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${
          plan.highlight
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30'
            : plan.id === 'premium'
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 shadow-lg'
            : 'border-2 border-border text-foreground hover:bg-muted hover:border-primary/50'
        }`}
      >
        {plan.cta}
      </button>

      {/* Trial note */}
      <div className={`text-center mt-4 space-y-1 ${plan.highlight ? 'text-primary/70' : 'text-muted-foreground'}`}>
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">✓ {TRIAL_DAYS} Dias Grátis</p>
        <p className="text-[10px] font-medium leading-tight">
          Sem fidelidade. Cancele ou mude de plano quando quiser.
        </p>
      </div>
    </>
  );

  if (!animate) {
    return <div className={cardClass}>{content}</div>;
  }
  return (
    <motion.div
      key={plan.id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className={cardClass}
    >
      {content}
    </motion.div>
  );
};

// ─── MODAL "VER MAIS PLANOS" ──────────────────────────────────────────────────
const AllPlansModal = ({ plans, onClose, onSelect }: {
  plans: any[];
  onClose: () => void;
  onSelect: (planId: string) => void;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Modal sempre ordenado do menor para o maior valor
  const sortedPlans = [...plans].sort((a, b) =>
    parseFloat(`${a.price}.${a.cents}`) - parseFloat(`${b.price}.${b.cents}`)
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="bg-background rounded-[32px] border border-border shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e: any) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 md:px-8 py-5 border-b border-border/60 shrink-0">
          <div>
            <h3 className="text-xl md:text-2xl font-outfit font-extrabold text-foreground">Todos os planos</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Todos incluem acesso imediato ao sistema completo e {TRIAL_DAYS} dias grátis.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Grid scrollável */}
        <div className="overflow-y-auto p-6 md:p-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {sortedPlans.map((plan, i) => (
              <PlanCard key={plan.id} plan={plan} index={i} onSelect={onSelect} animate={false} />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── LANDING PAGE PRINCIPAL ───────────────────────────────────────────────────
const LandingPage = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signupPlan, setSignupPlan] = useState<string | null>(null);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading, user } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === 'aluno') {
        setLocation("/aluno");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [isAuthenticated, loading, user, setLocation]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Bloquear scroll quando modal aberto
  useEffect(() => {
    if (signupPlan || showAllPlans) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [signupPlan, showAllPlans]);

  const { data: dbPlans, isLoading: loadingPlans } = trpc.publicData.getPlans.useQuery();

  const parseFeatures = (fStr: any) => {
    if (Array.isArray(fStr)) return fStr;
    try { 
      const parsed = JSON.parse(fStr); 
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  const plans = dbPlans?.filter(p => p.showOnLanding).sort((a, b) => (a.order || 0) - (b.order || 0)).map((p) => {
    const priceStr = Number(p.priceMonthly).toFixed(2);
    const [price, cents] = priceStr.split('.');
    const isHighlight = p.isPopular;
    
    return {
      id: p.id,
      name: p.name,
      subtitle: p.maxStudents >= 999999 ? 'Para escolas exigentes' : `Até ${p.maxStudents} alunos`,
      price,
      cents,
      highlight: isHighlight,
      badge: isHighlight ? 'Mais Escolhido' : null,
      features: parseFeatures(p.features),
      cta: 'Começar 7 Dias Grátis',
      ctaStyle: isHighlight ? 'solid' : 'border',
      allowExtraStudents: (p as any).allowExtraStudents ?? true,
      extraStudentPrice: Number((p as any).extraStudentPrice ?? 1.49),
      maxStudents: p.maxStudents,
    };
  }) || [];

  

  const navLinks = [
    { name: 'Recursos', href: '#features' },
    { name: 'Clientes & Parceiros', href: '#clients' },
    { name: 'Depoimentos', href: '#testimonials' },
    { name: 'Preços', href: '#pricing' },
    { name: 'Contato', href: 'https://wa.me/5533984055949?text=ola%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20sistema%20musicpro', target: '_blank' },
  ];

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 }
  };

  return (
    <div className="min-h-screen font-sans text-foreground bg-background selection:bg-primary/30 selection:text-primary">
      {/* MODAL */}
      <AnimatePresence>
        {signupPlan && (
          <SignupModal plan={signupPlan} onClose={() => setSignupPlan(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAllPlans && (
          <AllPlansModal
            plans={plans}
            onClose={() => setShowAllPlans(false)}
            onSelect={(planId) => { setShowAllPlans(false); setSignupPlan(planId); }}
          />
        )}
      </AnimatePresence>

      {/* NAVBAR */}
      <nav 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
          isScrolled 
          ? 'bg-background/90 backdrop-blur-xl border-border py-3' 
          : 'bg-transparent border-transparent py-5'
        }`}
      >
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform duration-300 overflow-hidden">
              <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center relative z-10">
                <div className="flex items-center gap-[3px] h-4">
                  <div className="w-1 bg-white/90 rounded-full h-2" />
                  <div className="w-1 bg-white/90 rounded-full h-4" />
                  <div className="w-1 bg-white rounded-full h-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                  <div className="w-1 bg-white/90 rounded-full h-3" />
                </div>
              </div>
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">Music<span className="text-primary">Pro</span></span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a 
                key={link.name} 
                href={link.href}
                target={link.target || "_self"}
                className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/login?type=aluno">
              <button className="px-5 py-2 text-xs font-black uppercase tracking-[0.2em] text-primary hover:opacity-80 transition-all border border-primary/20 bg-primary/5 rounded-xl">
                Área do Aluno
              </button>
            </Link>
            <Link href="/login?type=professor">
              <button className="px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                Área da Escola / Professor
              </button>
            </Link>
            <button
              onClick={() => setSignupPlan('profissional')}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 hover:-translate-y-0.5 transition-all active:scale-95"
            >
              Assinar Agora
            </button>
          </div>

          {/* Mobile Toggle */}
          <button 
            className="md:hidden text-foreground hover:text-primary transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-background border-b border-border/50 overflow-hidden"
            >
              <div className="container py-6 flex flex-col gap-4">
                {navLinks.map((link) => (
                  <a 
                    key={link.name} 
                    href={link.href}
                    target={link.target || "_self"}
                    className="text-lg font-medium text-foreground hover:text-primary transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.name}
                  </a>
                ))}
                <hr className="border-border/50 my-2" />
                <div className="flex flex-col gap-3">
                  <Link href="/login?type=aluno" onClick={() => setMobileMenuOpen(false)}>
                    <button className="w-full py-3 bg-muted text-foreground rounded-xl font-bold border border-border">Área do Aluno</button>
                  </Link>
                  <Link href="/login?type=professor" onClick={() => setMobileMenuOpen(false)}>
                    <button className="w-full py-3 bg-muted text-foreground rounded-xl font-bold border border-border">Área da Escola / Professor</button>
                  </Link>
                  <button
                    onClick={() => { setMobileMenuOpen(false); setSignupPlan('profissional'); }}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:bg-primary/90 transition-all"
                  >
                    Assinar Agora
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-background">
        {/* Background Gradient Mesh */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-15%] right-[-8%] w-[700px] h-[700px] bg-primary/8 rounded-full blur-[140px]" />
          <div className="absolute bottom-[-5%] left-[-5%] w-[500px] h-[500px] bg-indigo-500/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] bg-blue-400/5 rounded-full blur-[80px]" />
        </div>
        {/* Piano Decoration */}
        <div className="hidden xl:block absolute top-[40px] right-[-80px] transform -rotate-[8deg] z-0 pointer-events-none">
          <img src="/img/piano-trans.png" loading="lazy" alt="" className="w-[460px] object-contain select-none opacity-70 drop-shadow-2xl" draggable={false} />
        </div>

        <div className="container relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-6 hover:bg-primary/15 transition-colors cursor-default">
                <Star size={14} className="fill-current" />
                <span>Sistema completo para escolas de música</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-outfit font-extrabold text-foreground leading-tight mb-6 tracking-tight">
                Gestão total para <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-500">escolas de música</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg leading-relaxed font-medium">
                Pare de perder tempo com planilhas e WhatsApp. O MusicPro cuida da burocracia enquanto você foca no que ama: <strong className="text-foreground">ensinar música.</strong>
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
                <button
                  onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full sm:w-auto px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-xl shadow-primary/30 hover:bg-primary/90 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 group"
                >
                  Ver Planos e Preços
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
                <Link href="/login?type=professor">
                  <button className="w-full sm:w-auto px-8 py-4 bg-background border-2 border-primary/20 text-foreground rounded-2xl font-black text-sm uppercase tracking-widest hover:border-primary/50 hover:bg-muted/50 active:scale-95 transition-all flex items-center justify-center gap-3">
                    <Users size={18} className="text-primary" />
                    Área da Escola
                  </button>
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {[
                  { value: '100% Online', label: 'Acesso em qualquer lugar', color: 'text-primary' },
                  { value: '7 Dias Grátis', label: 'Sem cartão de crédito', color: 'text-indigo-500' },
                  { value: 'WhatsApp', label: 'Automação de lembretes', color: 'text-emerald-500' },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-3 sm:p-4 bg-card/60 rounded-2xl border border-border/50 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
                    <div className={`text-sm sm:text-base font-black ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground font-medium mt-0.5 leading-tight">{stat.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative hidden lg:flex items-center justify-center w-full max-w-2xl"
            >
              <div className="relative w-full">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-indigo-500/20 rounded-[48px] blur-2xl"></div>
                <img
                  src="/images/dashboard-preview.png"
                  alt="Dashboard do Sistema MusicPro"
                  className="relative rounded-[24px] shadow-2xl border border-border w-full h-auto object-cover"
                  onError={(e) => {
                    e.currentTarget.classList.add('hidden');
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
                <div className="hidden relative rounded-[24px] shadow-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-indigo-500/5 to-background flex flex-col items-center justify-center aspect-video">
                  <div className="text-center p-8">
                    <Music size={52} className="text-primary/40 mx-auto mb-4" />
                    <p className="text-foreground font-bold text-base">Dashboard MusicPro</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">Visualização do painel administrativo</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="mt-20 w-full">
            <HeroSlider />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative py-24 bg-muted/30 border-b border-border/50 overflow-hidden">
        {/* Instrument Decorations */}
        <div className="hidden xl:block absolute top-[20px] right-[-200px] transform rotate-[20deg] z-0 pointer-events-none">
          <img src="/img/guitar-trans.png" loading="lazy" alt="Imagem de guitarra" className="w-[500px] object-contain select-none opacity-90 drop-shadow-2xl" draggable={false} />
        </div>

        <div className="container relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-primary font-black tracking-widest uppercase text-sm mb-4">Tudo que você precisa</h2>
            <h3 className="text-4xl md:text-5xl font-outfit font-extrabold text-foreground mb-6">Funcionalidades pensadas para músicos</h3>
            <p className="text-lg text-muted-foreground font-medium">
              Desenvolvido por quem entende a rotina de uma escola de música. Simples de usar, poderoso nos resultados.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Users, title: 'Gestão de Alunos', desc: 'Cadastro completo, histórico de evolução, presença e notas em um só lugar.' },
              { icon: Calendar, title: 'Agendamento Inteligente', desc: 'Organize horários, aulas e eventos com um calendário visual e intuitivo.' },
              { icon: DollarSign, title: 'Controle Financeiro', desc: 'Mensalidades, comprovantes e relatórios financeiros automáticos.' },
              { icon: Bell, title: 'Lembretes Automáticos', desc: 'Notificações por WhatsApp para alunos sobre aulas e pagamentos pendentes.' },
              { icon: BarChart3, title: 'Relatórios Avançados', desc: 'Dashboards detalhados para tomar decisões baseadas em dados reais.' },
              { icon: Guitar, title: 'IA para Professores', desc: 'Gere planos de aula, análises de progresso e sugestões com inteligência artificial.' },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                {...fadeIn}
                transition={{ delay: i * 0.1 }}
                className="group p-8 bg-card/40 backdrop-blur-xl border border-border/50 rounded-[32px] hover:border-primary/30 shadow-2xl shadow-primary/5 hover:shadow-primary/20 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  <feature.icon size={22} />
                </div>
                <h4 className="text-lg font-extrabold text-foreground mb-3">{feature.title}</h4>
                <p className="text-muted-foreground font-medium leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <BenefitsCarousel />

      {/* ── CLIENTES & ESCOLAS PARCEIRAS (MARQUEE INFINITO) ──────────────── */}
      <ClientsMarquee />

      {/* TESTIMONIALS */}
      <section id="testimonials" className="relative py-24 bg-background overflow-hidden">
        {/* Instrument Decorations */}
        <div className="hidden xl:block absolute top-[20px] left-[-150px] transform -rotate-[15deg] z-0 pointer-events-none">
          <img src="/img/sax-trans.png" loading="lazy" alt="Imagem de saxofone" className="w-[450px] object-contain select-none opacity-80 drop-shadow-2xl" draggable={false} />
        </div>

        <div className="container relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-primary font-black tracking-widest uppercase text-sm mb-4">Depoimentos</h2>
            <h3 className="text-4xl md:text-5xl font-outfit font-extrabold text-foreground mb-6">Quem já usa, aprova</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Ana Lima', role: 'Diretora - Escola Harmonia', text: 'O MusicPro transformou completamente a forma como gerencio minha escola. Economizo horas por semana!', avatarColor: 'bg-gradient-to-br from-blue-500 to-indigo-600' },
              { name: 'Carlos Mendes', role: 'Professor - Studio Ritmo', text: 'Os lembretes automáticos reduziram em 80% as faltas dos alunos. Resultado incrível!', avatarColor: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
              { name: 'Patricia Souza', role: 'Fundadora - Acorde Music', text: 'O controle financeiro é fantástico. Antes era tudo planilha, agora tenho tudo automatizado.', avatarColor: 'bg-gradient-to-br from-violet-500 to-purple-600' },
            ].map((t, i) => (
              <motion.div key={t.name} {...fadeIn} transition={{ delay: i * 0.15 }} className="p-8 bg-card/40 backdrop-blur-xl shadow-2xl shadow-primary/5 border border-border/50 rounded-[32px] hover:border-primary/20 hover:shadow-primary/10 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} size={14} className="text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-muted-foreground font-medium mb-6 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md ${t.avatarColor}`}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-extrabold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRAÇÕES ────────────────────────────────────────────────────────── */}
      <section className="relative py-24 bg-background overflow-hidden">
        <div className="container relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-primary font-black tracking-widest uppercase text-sm mb-4">Integrações Oficiais</h2>
            <h3 className="text-4xl md:text-5xl font-outfit font-extrabold text-foreground mb-6">
              Receba pagamentos como os grandes
            </h3>
            <p className="text-lg text-muted-foreground font-medium">
              Integração nativa com as principais plataformas de pagamento do Brasil. Seus alunos pagam por Pix, cartão ou boleto — tudo automático e rastreado.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">

            {/* Asaas */}
            <motion.div
              {...fadeIn}
              transition={{ delay: 0 }}
              className="group relative p-8 bg-card/40 backdrop-blur-xl border border-border/50 rounded-[32px] hover:border-primary/30 shadow-2xl shadow-primary/5 hover:shadow-primary/20 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent rounded-[32px] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 font-black text-xl shadow-lg">
                    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
                      <rect width="40" height="40" rx="10" fill="#005AE2"/>
                      <path d="M10 25l5-10 5 10 5-10 5 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xl font-extrabold text-foreground">Asaas</h4>
                    <span className="text-xs font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">Integração Oficial</span>
                  </div>
                </div>
                <p className="text-muted-foreground font-medium leading-relaxed mb-6">
                  Gere cobranças de mensalidades com Pix, boleto bancário e cartão de crédito. A plataforma cria as faturas automaticamente e você acompanha tudo no painel.
                </p>
                <ul className="space-y-2">
                  {['Pix com QR Code automático', 'Boleto bancário e cartão', 'Dashboard de inadimplência', 'Notificação automática de vencimento'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {/* Mercado Pago */}
            <motion.div
              {...fadeIn}
              transition={{ delay: 0.15 }}
              className="group relative p-8 bg-card/40 backdrop-blur-xl border border-border/50 rounded-[32px] hover:border-primary/30 shadow-2xl shadow-primary/5 hover:shadow-primary/20 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent rounded-[32px] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-600 font-black text-xl shadow-lg">
                    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
                      <rect width="40" height="40" rx="10" fill="#FFF159"/>
                      <path d="M20 10c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S25.52 10 20 10zm0 16a6 6 0 110-12 6 6 0 010 12z" fill="#009EE3"/>
                      <circle cx="20" cy="20" r="3" fill="#009EE3"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xl font-extrabold text-foreground">Mercado Pago</h4>
                    <span className="text-xs font-bold text-yellow-700 bg-yellow-500/10 px-2 py-0.5 rounded-full">Integração Oficial</span>
                  </div>
                </div>
                <p className="text-muted-foreground font-medium leading-relaxed mb-6">
                  Checkout Mercado Pago completo com Pix, cartão de crédito em parcelas e muito mais. O link de pagamento é gerado automaticamente quando o aluno clica em "Pagar".
                </p>
                <ul className="space-y-2">
                  {['Checkout com Pix instantâneo', 'Cartão em até 12x', 'Link de pagamento automático', 'Confirmação em tempo real'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-yellow-500/10 text-yellow-600 flex items-center justify-center flex-shrink-0">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {/* InfinitePay */}
            <motion.div
              {...fadeIn}
              transition={{ delay: 0.3 }}
              className="group relative md:col-span-2 p-8 bg-card/40 backdrop-blur-xl border border-border/50 rounded-[32px] hover:border-primary/30 shadow-2xl shadow-primary/5 hover:shadow-primary/20 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-lime-500/5 via-transparent to-transparent rounded-[32px] pointer-events-none" />
              <div className="relative z-10 md:flex md:items-center md:gap-8">
                <div className="md:flex-1">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center shadow-lg">
                      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
                        <rect width="40" height="40" rx="10" fill="#0E0E10"/>
                        <circle cx="15" cy="20" r="6" stroke="#C8F169" strokeWidth="2.5"/>
                        <circle cx="25" cy="20" r="6" stroke="#C8F169" strokeWidth="2.5"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-extrabold text-foreground">InfinitePay</h4>
                      <span className="text-xs font-bold text-lime-600 bg-lime-500/10 px-2 py-0.5 rounded-full">Integração Oficial</span>
                    </div>
                  </div>
                  <p className="text-muted-foreground font-medium leading-relaxed mb-6">
                    Checkout seguro da InfinitePay com Pix (taxa zero) ou cartão de crédito em até 12x. O MusicPro gera o link e confirma o pagamento automaticamente — sem mensalidade e sem custo de integração.
                  </p>
                  <ul className="space-y-2">
                    {['PIX com taxa zero — você recebe 100%', 'Cartão em até 12x', 'Links curtos prontos para o WhatsApp', 'Confirmação automática em tempo real'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <span className="w-5 h-5 rounded-full bg-lime-500/10 text-lime-600 flex items-center justify-center flex-shrink-0">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="hidden md:block w-px h-40 bg-border/60" />
                <div className="hidden md:flex flex-col items-center text-center gap-2 px-6">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Você recebe</span>
                  <span className="text-3xl font-outfit font-black text-lime-600">100%</span>
                  <span className="text-[10px] font-medium text-muted-foreground max-w-[140px]">do valor de cada PIX — taxa zero na conta InfinitePay</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Bottom trust strip */}
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.3 }}
            className="mt-16 flex flex-col md:flex-row items-center justify-center gap-8 p-6 bg-muted/30 border border-border/50 rounded-[24px] max-w-3xl mx-auto"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600">
                <Shield size={20} />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">100% Seguro</p>
                <p className="text-xs text-muted-foreground">Dados criptografados e protegidos</p>
              </div>
            </div>
            <div className="w-px h-10 bg-border hidden md:block" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <CreditCard size={20} />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">Sem taxa adicional</p>
                <p className="text-xs text-muted-foreground">Use sua própria conta nas plataformas</p>
              </div>
            </div>
            <div className="w-px h-10 bg-border hidden md:block" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-600">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">Configuração em 2 min</p>
                <p className="text-xs text-muted-foreground">Cole sua chave de API e pronto</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── PREÇOS ─────────────────────────────────────────────────────────────── */}
      <section id="pricing" className="relative py-24 bg-muted/30 border-y border-border/50 overflow-hidden">
        {/* Instrument Decorations */}
        <div className="hidden xl:block absolute top-[40px] left-[-250px] transform -rotate-[15deg] z-0 pointer-events-none">
          <img src="/img/synth-trans.png" alt="" className="w-[600px] object-contain select-none opacity-80 drop-shadow-2xl" draggable={false} />
        </div>
        <div className="hidden xl:block absolute top-[40px] right-[-180px] transform rotate-[15deg] z-0 pointer-events-none">
          <img src="/img/violin-trans.png" alt="" className="w-[450px] object-contain select-none opacity-80 drop-shadow-2xl" draggable={false} />
        </div>

        <div className="container relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-primary font-black tracking-widest uppercase text-sm mb-4">Planos simples e transparentes</h2>
            <h3 className="text-4xl md:text-5xl font-outfit font-extrabold text-foreground mb-6">Escolha o plano ideal para sua escola</h3>
            <p className="text-lg text-muted-foreground font-medium">
              Todos os planos incluem <strong className="text-foreground">acesso imediato</strong> ao sistema completo.
            </p>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6 items-center">
              {plans.slice(0, 3).map((plan, i) => (
                <PlanCard key={plan.id} plan={plan} index={i} onSelect={setSignupPlan} />
              ))}
            </div>
          )}

          {/* Ver mais planos */}
          {plans.length > 3 && (
            <motion.div {...fadeIn} className="mt-10 text-center">
              <button
                onClick={() => setShowAllPlans(true)}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border-2 border-border bg-card/60 backdrop-blur-xl text-foreground font-black text-sm hover:border-primary/50 hover:bg-muted transition-all active:scale-[0.98]"
              >
                Ver mais planos
                <ChevronDown size={16} strokeWidth={3} className="text-primary" />
              </button>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                {plans.length - 3} {plans.length - 3 > 1 ? 'planos adicionais disponíveis' : 'plano adicional disponível'}
              </p>
            </motion.div>
          )}

          {/* Garantia */}
          <motion.div {...fadeIn} className="mt-16 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-4 bg-card border border-border/50 rounded-2xl">
              <Shield size={20} className="text-primary" />
              <span className="text-sm font-semibold text-muted-foreground">
                Garantia de {TRIAL_DAYS} dias: se não gostar, cancele sem custo algum.
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="relative py-24 bg-muted/20 border-y border-border/50">
        <div className="container max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-primary font-black tracking-widest uppercase text-sm mb-4">Perguntas Frequentes</h2>
            <h3 className="text-4xl font-outfit font-extrabold text-foreground mb-6">Tirando suas dúvidas</h3>
          </div>
          
          <div className="space-y-4">
            {[
              {
                q: "Preciso de cartão de crédito para os 7 dias grátis?",
                a: "Não! Você pode testar o sistema completo por 7 dias sem informar nenhum dado de pagamento. Só cobramos se você decidir continuar."
              },
              {
                q: "Como funciona a emissão de cobranças?",
                a: "Integramos com Asaas, Mercado Pago e InfinitePay. Você pode gerar boletos, PIX e cartões diretamente pelo sistema — com o InfinitePay o PIX tem taxa zero e você recebe 100%. A baixa no pagamento é automática."
              },
              {
                q: "Os lembretes do WhatsApp têm custo extra?",
                a: "Não cobramos pelos envios, pois o sistema conecta diretamente com o seu próprio WhatsApp! Apenas escaneie o QRCode e seus lembretes usarão seu número de forma gratuita e ilimitada."
              },
              {
                q: "Consigo acessar pelo celular?",
                a: "Sim, todo o sistema é 100% responsivo. Você e seus alunos podem acessar pelo navegador de qualquer dispositivo, funcionando como um aplicativo nativo."
              }
            ].map((faq, i) => (
              <details key={i} className="group bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <summary className="flex items-center justify-between p-6 cursor-pointer font-bold text-foreground hover:text-primary transition-colors list-none">
                  <span>{faq.q}</span>
                  <div className="w-8 h-8 flex items-center justify-center bg-primary/10 rounded-full text-primary group-open:-rotate-180 transition-transform duration-300">
                    <ChevronRight size={16} className="rotate-90" />
                  </div>
                </summary>
                <div className="px-6 pb-6 pt-2 text-muted-foreground font-medium leading-relaxed border-t border-border/30">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 border border-white/10 rounded-[48px] p-12 md:p-24 overflow-hidden shadow-2xl">
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.08)_0%,_transparent_70%)] pointer-events-none" />

            <div className="relative z-10 text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-blue-200 text-xs font-bold mb-8">
                <Sparkles size={14} className="text-blue-300" />
                <span>7 Dias Grátis · Sem Cartão de Crédito</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-outfit font-black text-white mb-8 leading-tight tracking-tight">
                Pronto para levar sua escola para o{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-indigo-300">próximo nível?</span>
              </h2>
              <p className="text-xl text-blue-100/70 font-medium mb-12 max-w-2xl mx-auto">
                Comece agora mesmo. Sem burocracia. Cancele quando quiser.
              </p>
              <button
                onClick={() => setSignupPlan('profissional')}
                className="px-10 py-5 bg-white text-blue-900 rounded-2xl font-black uppercase tracking-wider shadow-2xl hover:scale-105 hover:shadow-white/20 transition-all flex items-center gap-3 mx-auto text-sm"
              >
                Criar conta agora <ArrowRight size={20} />
              </button>
              <p className="mt-6 text-blue-300/50 text-sm font-medium">
                Sem fidelidade · Cancele quando quiser · Suporte incluído
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="contact" className="py-20 bg-muted/30 border-t border-border/50">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-20">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6 cursor-default">
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shadow-lg shadow-primary/30 overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center relative z-10">
                    <div className="flex items-center gap-[3px] h-4">
                      <div className="w-1 bg-white/90 rounded-full h-2" />
                      <div className="w-1 bg-white/90 rounded-full h-4" />
                      <div className="w-1 bg-white rounded-full h-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                      <div className="w-1 bg-white/90 rounded-full h-3" />
                    </div>
                  </div>
                </div>
                <span className="text-2xl font-black text-foreground tracking-tight">Music<span className="text-primary">Pro</span></span>
              </div>
              <p className="text-muted-foreground font-medium mb-8 max-w-sm leading-relaxed">
                A plataforma definitiva para gestão de escolas de música. Criada por músicos, para músicos.
              </p>
            </div>

            <div>
              <h5 className="font-extrabold text-foreground mb-6 uppercase tracking-widest text-sm">Produto</h5>
              <ul className="space-y-4 text-muted-foreground font-medium">
                <li><a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-primary transition-colors cursor-pointer">Recursos</a></li>
                <li><a href="#testimonials" onClick={(e) => { e.preventDefault(); document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-primary transition-colors cursor-pointer">Depoimentos</a></li>
                <li><a href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-primary transition-colors cursor-pointer">Preços</a></li>
                <li><Link href="/login" className="hover:text-primary transition-colors">Área do Aluno</Link></li>
              </ul>
            </div>

            <div>
              <h5 className="font-extrabold text-foreground mb-6 uppercase tracking-widest text-sm">Escola</h5>
              <ul className="space-y-4 text-muted-foreground font-medium">
                <li><a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-primary transition-colors cursor-pointer">Sobre nós</a></li>
                <li><a href="https://wa.me/5533984055949?text=Gostaria%20de%20saber%20sobre%20parceria%20com%20o%20MusicPro" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Parceiros</a></li>
                <li><a href="https://wa.me/5533984055949?text=Quero%20saber%20mais%20sobre%20o%20MusicPro" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Blog</a></li>
                <li><a href="https://wa.me/5533984055949?text=ola%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20sistema%20musicpro" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Contato</a></li>
              </ul>
            </div>

            <div>
              <h5 className="font-extrabold text-foreground mb-6 uppercase tracking-widest text-sm">Suporte</h5>
              <ul className="space-y-4 text-muted-foreground font-medium">
                <li><a href="https://wa.me/5533984055949?text=Preciso%20de%20ajuda%20com%20o%20MusicPro" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Central de Ajuda</a></li>
                <li><a href="/politica-de-privacidade" className="hover:text-primary transition-colors">Política de Privacidade</a></li>
                <li><a href="/termos-de-uso" className="hover:text-primary transition-colors">Termos de Uso</a></li>
                <li><a href="https://wa.me/5533984055949?text=Status%20do%20sistema%20MusicPro" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Status do Sistema</a></li>
              </ul>
            </div>

          </div>

          <div className="flex flex-col md:flex-row items-center justify-between pt-10 border-t border-border/50 text-muted-foreground font-medium text-sm gap-4">
            <p>© {new Date().getFullYear()} MusicPro. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

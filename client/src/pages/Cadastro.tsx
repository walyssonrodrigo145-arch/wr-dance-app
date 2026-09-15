import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Music, AlertCircle, ArrowRight, Loader2, Mail, CheckCircle2, Phone } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function Cadastro() {
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [password, setPassword] = useState("");
  const [planType, setPlanType] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data: plans } = trpc.publicData.getPlans.useQuery();
  const mainPlan = plans?.find(p => p.showOnLanding) || plans?.[0];

  const registerMutation = trpc.auth.registerWithPlan.useMutation({
    onSuccess: () => {
      setSuccessMsg("Conta criada com sucesso! Redirecionando...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    },
    onError: (err) => setErrorMsg(err.message)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanPhone = phone.replace(/\D/g, '');

    if (!name.trim()) return setErrorMsg("Por favor, informe seu nome completo.");
    if (!email.trim()) return setErrorMsg("O e-mail é obrigatório.");
    if (!emailRegex.test(email)) return setErrorMsg("Por favor, insira um e-mail válido.");
    if (!cleanPhone || cleanPhone.length < 10) return setErrorMsg("Por favor, informe seu número de WhatsApp com DDD.");
    if (!cpfCnpj.trim() || cpfCnpj.replace(/\D/g, '').length < 11) return setErrorMsg("Por favor, insira um CPF/CNPJ válido com pelo menos 11 dígitos.");
    if (!password) return setErrorMsg("Crie uma senha.");
    if (password.length < 6) return setErrorMsg("A senha deve ter pelo menos 6 caracteres.");
    if (!mainPlan) return setErrorMsg("Nenhum plano disponível para cadastro no momento.");
    
    registerMutation.mutate({ 
      name: name.trim(), 
      email: email.trim(),
      phone: cleanPhone,
      cpfCnpj: cpfCnpj.replace(/\D/g, ''),
      password,
      planType,
      planId: mainPlan.id
    });
  };

  const isLoading = registerMutation.isPending;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#050816] relative overflow-hidden py-12">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px]" />
      
      <div className="z-10 w-full max-w-[500px] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center flex flex-col items-center"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-violet-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-primary/20 group hover:scale-110 transition-transform duration-500">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
            Music<span className="text-primary">Pro</span>
          </h1>
          <p className="text-muted-foreground font-medium">
            Crie sua conta de professor e escolha seu plano
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Subtle inner glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-200 font-medium leading-relaxed">{errorMsg}</p>
              </motion.div>
            )}

            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-200 font-medium leading-relaxed">{successMsg}</p>
              </motion.div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">Seu Nome</Label>
                <Input 
                  type="text" 
                  placeholder="Nome Completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-14 bg-black/40 border-white/10 text-white rounded-2xl px-4 focus:ring-2 focus:ring-primary/50 transition-all hover:border-white/20"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">Seu E-mail</Label>
                <div className="relative group">
                  <Input 
                    type="email" 
                    placeholder="exemplo@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 bg-black/40 border-white/10 text-white rounded-2xl pl-12 focus:ring-2 focus:ring-primary/50 transition-all group-hover:border-white/20"
                  />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-primary transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">
                  WhatsApp com DDD <span className="text-primary font-bold">*</span>
                </Label>
                <div className="relative group">
                  <Input 
                    type="tel" 
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, '');
                      if (v.length > 11) v = v.slice(0, 11);
                      if (v.length > 10) {
                        v = v.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                      } else if (v.length > 6) {
                        v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
                      } else if (v.length > 2) {
                        v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
                      }
                      setPhone(v);
                    }}
                    className="h-14 bg-black/40 border-white/10 text-white rounded-2xl pl-12 focus:ring-2 focus:ring-primary/50 transition-all group-hover:border-white/20"
                  />
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-primary transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">CPF ou CNPJ</Label>
                <Input 
                  type="text" 
                  placeholder="000.000.000-00"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  className="h-14 bg-black/40 border-white/10 text-white rounded-2xl px-4 focus:ring-2 focus:ring-primary/50 transition-all hover:border-white/20"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">Sua Senha</Label>
                <Input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 bg-black/40 border-white/10 text-white rounded-2xl px-4 focus:ring-2 focus:ring-primary/50 transition-all hover:border-white/20"
                />
              </div>
            </div>

            <div className="pt-4 pb-2">
              <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1 mb-4 block">Escolha seu plano</Label>
              <RadioGroup value={planType} onValueChange={(v: any) => setPlanType(v)} className="space-y-3">
                <Label
                  htmlFor="plan-monthly"
                  className={`flex flex-col p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    planType === 'MONTHLY' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-white/10 bg-black/40 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="MONTHLY" id="plan-monthly" className="border-white/50 text-primary" />
                      <span className="text-white font-bold text-base">{mainPlan ? `${mainPlan.name} Mensal` : 'Plano Mensal'}</span>
                    </div>
                    <span className="text-primary font-black text-lg">
                      R$ {mainPlan ? Number(mainPlan.priceMonthly).toFixed(2).replace('.', ',') : '49,90'}
                      <span className="text-xs text-white/50 font-normal">/mês</span>
                    </span>
                  </div>
                  <p className="text-white/60 text-xs mt-2 pl-7">Acesso total à plataforma com cobrança mensal.</p>
                </Label>

                <Label
                  htmlFor="plan-yearly"
                  className={`flex flex-col p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    planType === 'YEARLY' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-white/10 bg-black/40 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between relative z-0">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="YEARLY" id="plan-yearly" className="border-white/50 text-primary" />
                      <span className="text-white font-bold text-base">{mainPlan ? `${mainPlan.name} Anual` : 'Plano Anual'}</span>
                    </div>
                    <div className="text-right">
                      {mainPlan && (
                        <span className="text-white/40 line-through text-xs block">
                          R$ {(Number(mainPlan.priceMonthly) * 12).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      <span className="text-emerald-400 font-black text-lg">
                        R$ {mainPlan ? Number(mainPlan.priceYearly).toFixed(2).replace('.', ',') : '499,00'}
                        <span className="text-xs text-white/50 font-normal">/ano</span>
                      </span>
                    </div>
                  </div>
                  <p className="text-white/60 text-xs mt-2 pl-7">Economize com a assinatura anual completa.</p>
                </Label>
              </RadioGroup>
            </div>

            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group mt-4"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  Iniciar 7 Dias Grátis
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
            
            <div className="mt-8 text-center">
              <p className="text-white/60 text-sm">
                Já possui conta?{' '}
                <button 
                  type="button" 
                  onClick={() => window.location.href = "/login?type=professor"} 
                  className="text-primary font-bold hover:underline transition-all"
                >
                  Faça login
                </button>
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

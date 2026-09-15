import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Music, AlertCircle, ArrowRight, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export default function Login() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const loginType = searchParams.get('type') as 'aluno' | 'professor' | undefined;

  const [errorMsg, setErrorMsg] = useState(searchParams.get('error') || "");
  const [successMsg, setSuccessMsg] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.mustChangePassword) {
        setShowResetPassword(true);
        return;
      }
      if (data.role === 'aluno') {
        window.location.href = "/aluno";
      } else {
        window.location.href = "/dashboard";
      }
    },
    onError: (err) => setErrorMsg(err.message)
  });

  const updatePasswordMutation = trpc.auth.updateMyPassword.useMutation({
    onSuccess: () => {
      setSuccessMsg("Senha atualizada com sucesso! Redirecionando...");
      setTimeout(() => {
        if (loginMutation.data?.role === 'aluno') {
          window.location.href = "/aluno";
        } else {
          window.location.href = "/dashboard";
        }
      }, 1500);
    },
    onError: (err) => setErrorMsg(err.message)
  });

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return setErrorMsg("A senha deve ter no mínimo 8 caracteres, incluindo letras e números");
    if (newPassword !== confirmPassword) return setErrorMsg("As senhas não coincidem.");
    updatePasswordMutation.mutate({ password: newPassword });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) return setErrorMsg("Informe seu e-mail para entrar.");
    if (!emailRegex.test(email)) return setErrorMsg("O formato do e-mail parece incorreto.");
    if (!password) return setErrorMsg("A senha é necessária para o acesso.");
    
    loginMutation.mutate({ 
      email: email.trim(), 
      password, 
      rememberMe,
      loginType: loginType as 'aluno' | 'professor' | undefined
    });
  };

  const handleGoogleLogin = () => {
    if (typeof window !== "undefined" && (window.location.protocol.includes("capacitor") || window.location.origin.includes("localhost"))) {
      window.location.href = "https://wrmusicpro.com.br/api/auth/google";
    } else {
      window.location.href = "/api/auth/google";
    }
  };

  const isLoading = loginMutation.isPending;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#050816] relative overflow-hidden py-8" style={{ minHeight: '100dvh' }}>
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03] pointer-events-none">
        <Music size={600} className="absolute top-0 left-0 -rotate-12" />
        <Music size={400} className="absolute bottom-0 right-0 rotate-12" />
      </div>
      
      <div className="z-10 w-full max-w-[440px] px-4 sm:px-0 mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center flex flex-col items-center"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-violet-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-primary/20 group hover:scale-110 transition-transform duration-500">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
            Music<span className="text-primary">Pro</span>
          </h1>
          <p className="text-muted-foreground font-medium">
            {loginType === 'aluno' ? 'Área do Aluno' : 'Área da Escola / Professor'}
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Subtle inner glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          {showResetPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-6 relative z-10">
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
                <div className="mb-4 text-center">
                  <h3 className="text-xl font-bold text-white">Redefinir Senha</h3>
                  <p className="text-white/70 text-sm mt-2">Para sua segurança, defina uma nova senha antes de continuar.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">Nova Senha</Label>
                  <Input 
                    type="password" 
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-14 bg-black/40 border-white/10 text-white rounded-2xl px-4 focus:ring-2 focus:ring-primary/50 transition-all hover:border-white/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs ml-1">Confirmar Nova Senha</Label>
                  <Input 
                    type="password" 
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-14 bg-black/40 border-white/10 text-white rounded-2xl px-4 focus:ring-2 focus:ring-primary/50 transition-all hover:border-white/20"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={updatePasswordMutation.isPending}
                className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
              >
                {updatePasswordMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Atualizar Senha"}
              </Button>
            </form>
          ) : (
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
                <div className="flex items-center justify-between ml-1">
                  <Label className="text-white/70 font-semibold uppercase tracking-wider text-xs">Sua Senha</Label>
                  <button type="button" className="text-xs text-primary font-bold hover:text-primary/80 transition-colors">
                    Esqueceu?
                  </button>
                </div>
                <Input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 bg-black/40 border-white/10 text-white rounded-2xl px-4 focus:ring-2 focus:ring-primary/50 transition-all hover:border-white/20"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="remember" 
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                className="border-white/20 data-[state=checked]:bg-primary"
              />
              <label
                htmlFor="remember"
                className="text-sm font-medium leading-none text-white/70 cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Mantenha-me conectado
              </label>
            </div>

            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full h-14 bg-white text-black hover:bg-white/90 font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-white/10 flex items-center justify-center gap-2 group"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-white/30 text-xs font-bold uppercase tracking-widest">OU</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full h-14 bg-black/40 border border-white/10 hover:border-white/30 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-3 hover:bg-black/60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar com Google
            </button>
            
            {loginType !== 'aluno' && (
              <div className="mt-8 text-center">
                <p className="text-white/60 text-sm">
                  Não possui conta?{' '}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (loginType === 'professor') {
                        window.location.href = "/cadastro";
                      }
                    }} 
                    className="text-primary font-bold hover:underline transition-all"
                  >
                    Cadastre-se grátis
                  </button>
                </p>
              </div>
            )}
          </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}

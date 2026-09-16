import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { DanceProLogo } from "@/components/DanceProLogo";

/** Página pública de redefinição de senha (link enviado por e-mail: /reset-password?token=...). */
export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => setLocation("/login"), 2500);
    },
    onError: (err) => setError(err.message || "Não foi possível redefinir a senha."),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("Link inválido: token ausente. Solicite a recuperação novamente.");
      return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("A senha deve ter no mínimo 8 caracteres, incluindo letras e números.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    resetPassword.mutate({ token, newPassword: password });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#070514] p-6">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0D0A22] p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-3 mb-8">
          <DanceProLogo className="h-10" />
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <KeyRound className="text-indigo-400" size={22} />
          </div>
          <h1 className="text-xl font-black text-white">Criar nova senha</h1>
          <p className="text-xs text-white/50 text-center font-medium">
            Escolha uma senha com no mínimo 8 caracteres, incluindo letras e números.
          </p>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-white">
                Senha redefinida com sucesso! Redirecionando para o login...
              </p>
            </div>
            <Button className="w-full h-12" onClick={() => setLocation("/login")}>Ir para o login</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Nova senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoFocus
                className="h-12 bg-black/40 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="••••••••"
                className="h-12 bg-black/40 border-white/10 text-white"
              />
            </div>

            {error && (
              <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <AlertCircle size={13} /> {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={resetPassword.isPending}
              className="w-full h-12 bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs"
            >
              {resetPassword.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Redefinir senha
            </Button>

            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full text-center text-xs font-bold text-white/50 hover:text-white transition-colors"
            >
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

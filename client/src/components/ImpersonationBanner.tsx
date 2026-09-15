import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function ImpersonationBanner() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const stopImpersonation = trpc.superAdmin.stopImpersonation.useMutation();

  if (!user || !(user as any).isImpersonated) {
    return null;
  }

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await stopImpersonation.mutateAsync();
      toast.success("Sessão de suporte finalizada. Retornando ao Super Admin...");
      setTimeout(() => {
        window.location.href = res.redirectUrl || "/super-admin";
      }, 500);
    } catch (err: any) {
      toast.error(err.message || "Erro ao encerrar modo suporte");
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2 text-xs font-bold shadow-lg sticky top-0 z-[9999] flex items-center justify-between animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2">
        <div className="p-1 bg-white/20 rounded-md animate-pulse">
          <ShieldAlert size={16} className="text-white" />
        </div>
        <span>
          <strong>MODO SUPORTE ATIVO:</strong> Você está acessando a conta de{" "}
          <span className="underline font-black">{user.name || user.email}</span> ({user.role?.toUpperCase()}).
        </span>
      </div>

      <button
        onClick={handleStop}
        disabled={loading}
        className="bg-white text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
        Voltar para Super Admin
      </button>
    </div>
  );
}

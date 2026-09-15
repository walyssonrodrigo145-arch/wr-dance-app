import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PenLine, PlugZap, RefreshCw, Unplug, Loader2, ShieldCheck,
  AlertTriangle, HelpCircle, CheckCircle2, XCircle, FileSignature, ExternalLink,
} from "lucide-react";

const ASSINAFY_DOCS_URL = "https://api.assinafy.com.br/v1/docs#introduction";

function formatDate(d?: string | Date | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function ConnectModal({
  open,
  onClose,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  mode: "connect" | "update";
}) {
  const utils = trpc.useUtils();
  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("production");
  const [confirmUpdate, setConfirmUpdate] = useState(false);

  const connectMutation = trpc.signatureIntegrations.connect.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "Conectada!");
      utils.signatureIntegrations.getStatus.invalidate();
      setApiKey("");
      setEnvironment("production");
      setConfirmUpdate(false);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.signatureIntegrations.updateApiKey.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "API Key atualizada!");
      utils.signatureIntegrations.getStatus.invalidate();
      setApiKey("");
      setConfirmUpdate(false);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  const isUpdate = mode === "update";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
              <FileSignature size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">{isUpdate ? "Alterar API Key" : "Conectar Assinafy"}</h3>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Assinatura Digital</p>
            </div>
          </div>
          <button onClick={() => { setConfirmUpdate(false); onClose(); }} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isUpdate && !confirmUpdate ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground font-medium leading-relaxed">
                  Ao alterar a API Key, novas operações de assinatura utilizarão a nova credencial.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={() => onClose()}>
                  Cancelar
                </Button>
                <Button className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold" onClick={() => setConfirmUpdate(true)}>
                  Continuar
                </Button>
              </div>
            </div>
          ) : (
            <>
              {!isUpdate && (
                <ol className="space-y-1.5 text-xs text-muted-foreground font-medium list-decimal list-inside leading-relaxed">
                  <li>Crie sua conta na <b>Assinafy</b>.</li>
                  <li>Acesse sua área de <b>API</b>.</li>
                  <li>Gere sua <b>API Key</b>.</li>
                  <li>Cole a chave abaixo.</li>
                </ol>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="mIpe_zdJfKUp..."
                  className="h-12 w-full rounded-xl border border-border bg-muted/30 px-4 font-mono text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
                />
              </div>

              {!isUpdate && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">Ambiente</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["sandbox", "production"] as const).map((env) => (
                      <button
                        key={env}
                        onClick={() => setEnvironment(env)}
                        className={cn(
                          "h-11 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all",
                          environment === env
                            ? "bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-500/20"
                            : "bg-muted/30 border-border text-muted-foreground hover:border-violet-400/40"
                        )}
                      >
                        {env === "sandbox" ? "Sandbox" : "Produção"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <a
                href={ASSINAFY_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-bold text-violet-600 hover:underline"
              >
                <HelpCircle size={13} /> Como gerar minha API Key?
              </a>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={() => { setConfirmUpdate(false); onClose(); }}>
                  Cancelar
                </Button>
                <Button
                  disabled={apiKey.trim().length < 10 || (isUpdate ? updateMutation.isPending : connectMutation.isPending)}
                  onClick={() => {
                    if (isUpdate) updateMutation.mutate({ apiKey: apiKey.trim() });
                    else connectMutation.mutate({ apiKey: apiKey.trim(), environment });
                  }}
                  className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold"
                >
                  {(isUpdate ? updateMutation.isPending : connectMutation.isPending) ? (
                    <Loader2 size={16} className="animate-spin mr-2" />
                  ) : (
                    <PlugZap size={16} className="mr-2" />
                  )}
                  {isUpdate ? "Salvar nova chave" : "Conectar"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AssinafyIntegrationCard() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.signatureIntegrations.getStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [modal, setModal] = useState<null | "connect" | "update">(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [testing, setTesting] = useState(false);

  const testMutation = trpc.signatureIntegrations.testConnection.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "Conexão realizada com sucesso.");
      utils.signatureIntegrations.getStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setTesting(false),
  });

  const disconnectMutation = trpc.signatureIntegrations.disconnect.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "Desconectada.");
      utils.signatureIntegrations.getStatus.invalidate();
      setConfirmDisconnect(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const isConnected = status?.active && status.connectionStatus === "connected";
  const isInvalid = status?.connectionStatus === "invalid_credentials";

  return (
    <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
            <FileSignature size={22} />
          </div>
          <div>
            <h4 className="text-sm font-black text-foreground uppercase tracking-wider">Assinatura Digital</h4>
            <p className="text-xs text-muted-foreground font-medium">
              Assinafy — assinatura eletrônica de contratos com validade jurídica.
            </p>
          </div>
        </div>
        {isLoading ? (
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        ) : isConnected ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 size={13} /> Conectada
          </span>
        ) : (
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
            isInvalid
              ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
              : "bg-slate-500/10 text-slate-500 border-slate-500/20"
          )}>
            {isInvalid ? <XCircle size={13} /> : <ShieldCheck size={13} />}
            {isInvalid ? "API Key inválida" : status?.active ? "Desconectada" : "Não configurada"}
          </span>
        )}
      </div>

      {!status ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Conecte sua conta da <b>Assinafy</b> para permitir a assinatura digital dos contratos.
            Cada escola utiliza a <b>sua própria API Key</b> — os custos de assinatura são da sua conta Assinafy.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setModal("connect")} className="h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-lg shadow-violet-500/20">
              <PlugZap size={16} className="mr-2" /> Conectar Assinafy
            </Button>
            <a
              href={ASSINAFY_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-600 hover:underline self-center"
            >
              <ExternalLink size={13} /> Saiba como criar sua conta
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-muted/30 border border-border/50">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Ambiente</p>
              <p className="font-bold text-foreground capitalize mt-0.5">{status.environment}</p>
            </div>
            <div className="p-3 rounded-2xl bg-muted/30 border border-border/50">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">API Key</p>
              <p className="font-bold text-foreground font-mono mt-0.5">{status.apiKeyMasked}</p>
            </div>
            <div className="col-span-2 p-3 rounded-2xl bg-muted/30 border border-border/50">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Última verificação</p>
              <p className="font-bold text-foreground mt-0.5">{formatDate(status.lastConnectionTest)}</p>
            </div>
          </div>

          {isInvalid && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <AlertTriangle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600 font-medium leading-relaxed">
                Sua conexão com a Assinafy precisa ser atualizada. A API Key cadastrada pode ter sido revogada ou alterada.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-xl font-bold text-xs"
              onClick={() => {
                setTesting(true);
                testMutation.mutate();
              }}
              disabled={testing || testMutation.isPending}
            >
              {testing || testMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
              Testar conexão
            </Button>
            <Button variant="outline" className="h-10 rounded-xl font-bold text-xs" onClick={() => setModal("update")}>
              <PenLine size={14} className="mr-1.5" /> Alterar API Key
            </Button>
            {confirmDisconnect ? (
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <span className="text-[10px] font-bold text-rose-600 px-1">Desconectar?</span>
                <Button
                  size="sm"
                  className="h-8 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black px-3"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Sim, desconectar
                </Button>
                <Button size="sm" variant="ghost" className="h-8 rounded-lg text-[10px] font-black px-2" onClick={() => setConfirmDisconnect(false)}>
                  Não
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="h-10 rounded-xl font-bold text-xs text-rose-600 border-rose-500/20 hover:bg-rose-500/10" onClick={() => setConfirmDisconnect(true)}>
                <Unplug size={14} className="mr-1.5" /> Desconectar
              </Button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
            Contratos já assinados não serão apagados. Novos contratos não poderão ser enviados até que uma nova conexão seja configurada.
          </p>
        </div>
      )}

      <ConnectModal open={modal !== null} mode={modal ?? "connect"} onClose={() => setModal(null)} />
    </div>
  );
}

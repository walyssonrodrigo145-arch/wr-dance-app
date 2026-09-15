import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Smartphone, Phone, CheckCircle2 } from "lucide-react";
import { DebouncedInput } from "./Misc";

// ─── GESTÃO DE SESSÕES BAILEYS ────────────────────────────────────────────────
export function WhatsAppSessionManager() {
  const [step, setStep] = useState<"DISCONNECTED" | "PAIRING" | "CONNECTED">("DISCONNECTED");
  const [modeTab, setModeTab] = useState<"QR_CODE" | "PAIRING_CODE">("QR_CODE");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [qrString, setQrString] = useState("");
  const [connectedPhone, setConnectedPhone] = useState("");
  const [timeLeft, setTimeLeft] = useState(120);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const startSession = trpc.whatsapp.startSession.useMutation();
  const logoutSession = trpc.whatsapp.logout.useMutation();
  const testConnection = trpc.whatsapp.testConnection.useMutation();
  const getStatusQuery = trpc.whatsapp.getStatus.useQuery(undefined, {
    refetchInterval: step === "PAIRING" ? 3000 : false, // Polling a cada 3s se PAIRING
  });

  const [testingConnection, setTestingConnection] = useState(false);

  // Atualizar estado baseado na query - SÓ age quando conectado com sucesso
  // Nunca derruba o passo PAIRING enquanto o usuário está escaneando
  useEffect(() => {
    if (!getStatusQuery.data) return;
    const data = getStatusQuery.data as any;
    const s = data.status;
    if (s === "CONNECTED") {
      setStep("CONNECTED");
      setConnectedPhone(data.phone || phoneNumber || "Conectado");
    } else if (s === "PAIRING") {
      if (data.qr && !qrString) setQrString(data.qr);
      if (data.pairingCode && !pairingCode) setPairingCode(data.pairingCode);
    }
    // INTENCIONALMENTE não reseta para DISCONNECTED durante PAIRING
    // O timer de 120s cuida disso.
  }, [getStatusQuery.data, qrString, pairingCode]);

  // Timer de 120 segundos no modo PAIRING (tempo suficiente para abrir o celular e escanear)
  useEffect(() => {
    if (step !== "PAIRING") return;
    setTimeLeft(120);
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setStep("DISCONNECTED");
          toast.error("O tempo de pareamento expirou. Tente novamente.");
          return 120;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const handleStart = async () => {
    if (modeTab === "PAIRING_CODE" && !phoneNumber) {
      toast.error("Por favor, digite o número do WhatsApp com DDD.");
      return;
    }
    setLoading(true);
    // Limpar estado anterior
    setPairingCode("");
    setQrString("");
    try {
      const res = await startSession.mutateAsync({ 
        phoneNumber: modeTab === "PAIRING_CODE" ? phoneNumber : undefined,
        mode: modeTab,
      });
      if (res.success) {
        if (res.mode === "QR_CODE" && modeTab === "PAIRING_CODE" && !res.pairingCode && res.qr) {
          setModeTab("QR_CODE");
          setQrString(res.qr);
          toast.info("Código de pareamento direto indisponível no momento. Geramos o QR Code para conexão.");
        } else {
          if (res.qr) setQrString(res.qr);
          if (res.pairingCode) setPairingCode(res.pairingCode);
          toast.success(res.mode === "PAIRING_CODE" && res.pairingCode ? "Código gerado! Digite no WhatsApp." : "QR Code gerado! Escaneie com seu celular.");
        }
        setStep("PAIRING");
        getStatusQuery.refetch();
      } else {
        toast.error((res as any).error || "Falha ao iniciar pareamento.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Tem certeza que deseja desconectar o seu WhatsApp? O sistema passará a usar o número padrão da escola.")) return;
    setLoading(true);
    try {
      await logoutSession.mutateAsync();
      setStep("DISCONNECTED");
      setPairingCode("");
      setQrString("");
      setConnectedPhone("");
      toast.success("WhatsApp desconectado com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao desconectar.");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      await testConnection.mutateAsync();
      toast.success("Sessão ativa! Mensagem de teste enviada com sucesso para o seu celular.");
    } catch (err: any) {
      toast.error("Conexão inativa ou falhou: " + (err.message || "Erro desconhecido"));
    } finally {
      setTestingConnection(false);
    }
  };

  // Garante a formatação exata de 4 em 4 (Ex: YVOA - 252N) e bloqueia hashes residuais
  const formattedPairingCode = (() => {
    if (!pairingCode) return "";
    const cleanCode = pairingCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleanCode.length === 8) {
      return `${cleanCode.slice(0, 4)} - ${cleanCode.slice(4)}`;
    }
    if (cleanCode.length > 8) {
      return `${cleanCode.slice(0, 4)} - ${cleanCode.slice(4, 8)}`;
    }
    return pairingCode;
  })();

  const handleCopy = () => {
    navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    toast.success("Código copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (getStatusQuery.isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-xl rounded-[2.5rem] border border-border shadow-2xl p-6 lg:p-10 flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 size={36} className="animate-spin text-indigo-500 mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Verificando status de conexão...</p>
      </div>
    );
  }

  return (
    <div className="bg-card/80 backdrop-blur-xl rounded-[2.5rem] border border-border shadow-2xl p-6 lg:p-10 transition-all duration-500 overflow-hidden relative mb-8">
      {/* Decoração de fundo */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {step === "DISCONNECTED" && (
        <div className="space-y-8 animate-in fade-in-50 duration-500">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xl shadow-indigo-500/30">
              <Smartphone size={28} />
            </div>
            <div>
              <h4 className="text-xl font-black text-foreground uppercase tracking-wider">Conexão Multi-Sessão WhatsApp</h4>
              <p className="text-xs text-muted-foreground font-medium mt-1 leading-relaxed max-w-xl">
                Escolha o método de pareamento de sua preferência para vincular seu celular ao sistema e realizar disparos automáticos de lembretes.
              </p>
            </div>
          </div>

          {/* Abas de Seleção (Tabs) */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-muted/60 backdrop-blur-md rounded-2xl border border-border/80 shadow-inner">
            <button
              type="button"
              onClick={() => setModeTab("QR_CODE")}
              className={cn(
                "py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                modeTab === "QR_CODE"
                  ? "bg-background text-foreground shadow-lg shadow-black/5 border border-border/50 scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <span>📱 Conectar com QR Code</span>
            </button>
            <button
              type="button"
              onClick={() => setModeTab("PAIRING_CODE")}
              className={cn(
                "py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                modeTab === "PAIRING_CODE"
                  ? "bg-background text-foreground shadow-lg shadow-black/5 border border-border/50 scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <span>☎️ Conectar com Telefone</span>
            </button>
          </div>

          <div className="bg-muted/30 backdrop-blur-md p-6 rounded-3xl border border-border/80 space-y-6 shadow-sm">
            {modeTab === "QR_CODE" ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                  <Smartphone size={32} />
                </div>
                <h5 className="text-sm font-black uppercase tracking-widest text-foreground">Escaneamento Instantâneo</h5>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  O sistema gerará um QR Code seguro na tela. Basta abrir o WhatsApp no seu celular e apontar a câmera para conectar instantaneamente.
                </p>
                <Button
                  onClick={handleStart}
                  disabled={loading}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-500/25 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Smartphone size={20} className="mr-2" />}
                  Gerar QR Code
                </Button>
              </div>
            ) : (
              <div className="space-y-6 py-2">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-2.5">DDD + Número do Celular</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <DebouncedInput
                      value={phoneNumber}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        let clean = e.target.value.replace(/\D/g, "");
                        if (!clean) {
                          setPhoneNumber("");
                          return;
                        }
                        
                        let prefix = "";
                        if (clean.startsWith("55") && clean.length > 11) {
                          prefix = "+55 ";
                          clean = clean.substring(2);
                        }
                        
                        let formatted = prefix + clean;
                        if (clean.length > 2 && clean.length <= 6) {
                          formatted = prefix + `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
                        } else if (clean.length > 6 && clean.length <= 10) {
                          formatted = prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
                        } else if (clean.length > 10) {
                          formatted = prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
                        }
                        
                        setPhoneNumber(formatted);
                      }}
                      placeholder="(33) 99999-9999"
                      className="pl-12 h-14 text-base font-bold rounded-2xl border-border bg-background focus:bg-card transition-all shadow-sm"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 font-medium">
                    Digite o número exato que está no seu WhatsApp. 
                    <strong className="text-orange-500 block mt-1">⚠️ Se o código for gerado mas não conectar no celular, tente solicitar novamente tirando ou colocando o "9" após o DDD.</strong>
                  </p>
                </div>

                <Button
                  onClick={handleStart}
                  disabled={loading || phoneNumber.replace(/\D/g, "").length < 10}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-500/25 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Smartphone size={20} className="mr-2" />}
                  Gerar Código de Conexão
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === "PAIRING" && (
        <div className="space-y-8 animate-in zoom-in-95 duration-500">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto animate-pulse">
              <Smartphone size={32} />
            </div>
            <h4 className="text-xl font-black text-foreground uppercase tracking-wider">Pareamento Ativo</h4>
            <p className="text-xs text-muted-foreground font-medium max-w-md mx-auto">
              {modeTab === "QR_CODE" 
                ? "Abra o WhatsApp no celular e escaneie o QR Code abaixo." 
                : "Digite o código abaixo no seu WhatsApp para conectar sua conta ao sistema."}
            </p>
          </div>

          <div className="bg-muted/50 backdrop-blur-md p-8 rounded-3xl border border-border text-center relative overflow-hidden group shadow-inner">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse" />
            
            {modeTab === "QR_CODE" ? (
              <div className="flex flex-col items-center justify-center py-4 space-y-6">
                {qrString ? (
                  <div className="p-4 bg-white rounded-3xl border-4 border-indigo-500/20 shadow-2xl animate-in zoom-in duration-500">
                    <img 
                      src={qrString.startsWith('data:image') ? qrString : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrString)}`} 
                      alt="WhatsApp QR Code"
                      className="w-60 h-60 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-60 h-60 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl bg-background/50 space-y-3">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Gerando QR Code...</span>
                  </div>
                )}
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Aponte a câmera do WhatsApp</p>
              </div>
            ) : (
              <div className="space-y-6 py-2">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Código de Pareamento</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      fontWeight: 700,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase"
                    }}
                    className="text-3xl lg:text-4xl text-indigo-600 dark:text-indigo-400 select-all bg-background py-5 px-8 rounded-2xl border border-border inline-block shadow-inner"
                  >
                    {formattedPairingCode || "GERANDO..."}
                  </div>
                  <Button
                    onClick={handleCopy}
                    disabled={!pairingCode}
                    className="h-16 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all active:scale-95"
                  >
                    {copied ? <CheckCircle2 size={20} className="text-green-400" /> : <Smartphone size={20} />}
                    {copied ? "Copiado!" : "Copiar"}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
              Aguardando confirmação do celular ({timeLeft}s restantes)...
            </div>
          </div>

          <div className="bg-card/90 backdrop-blur-md p-6 rounded-2xl border border-border space-y-3 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-foreground">Passo a passo no seu celular:</p>
            <ol className="text-xs text-muted-foreground space-y-2 font-medium list-decimal list-inside">
              <li>Abra o WhatsApp no seu celular.</li>
              <li>Toque no menu de <span className="text-foreground font-bold">Opções/Configurações</span> (três pontinhos).</li>
              <li>Selecione <span className="text-foreground font-bold">Aparelhos Conectados</span>.</li>
              <li>Toque em <span className="text-foreground font-bold">Conectar um aparelho</span>.</li>
              {modeTab === "QR_CODE" ? (
                <li>Aponte a câmera para o QR Code exibido na tela.</li>
              ) : (
                <li>Escolha <span className="text-foreground font-bold">Conectar com número de telefone</span> e digite o código acima.</li>
              )}
            </ol>
          </div>

          <Button
            onClick={() => setStep("DISCONNECTED")}
            variant="outline"
            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all shadow-sm"
          >
            Cancelar Pareamento
          </Button>
        </div>
      )}

      {step === "CONNECTED" && (
        <div className="space-y-8 text-center animate-in zoom-in-95 duration-500 py-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-green-600 to-emerald-500 text-white flex items-center justify-center mx-auto shadow-2xl shadow-green-500/30 border-4 border-green-400/20">
            <CheckCircle2 size={48} className="animate-bounce" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-xs font-black uppercase tracking-widest mb-2 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping" />
              ✅ WhatsApp Conectado com Sucesso!
            </div>
            <h4 className="text-3xl font-black text-foreground">{connectedPhone}</h4>
            <p className="text-xs text-muted-foreground font-medium max-w-md mx-auto mt-3 leading-relaxed">
              Seu WhatsApp está perfeitamente vinculado e operando 24/7 em segundo plano para disparar lembretes automáticos aos alunos.
            </p>
          </div>

          <div className="pt-6 flex flex-wrap justify-center gap-4">
            <Button
              onClick={handleTestConnection}
              disabled={testingConnection || loading}
              className="h-14 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              {testingConnection ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
              Testar Conexão
            </Button>
            <Button
              onClick={handleLogout}
              disabled={loading || testingConnection}
              variant="outline"
              className="h-14 px-8 rounded-2xl border-destructive/20 text-destructive hover:bg-destructive hover:text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg hover:shadow-destructive/25 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
              Desconectar Conta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
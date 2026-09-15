import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Smartphone, Download } from "lucide-react";

export function PwaInstallSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verificar se já está rodando como PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Checagem imediata: o evento pode já ter disparado antes do componente carregar
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    // Listener para o evento global capturado no index.html
    const handlePromptReady = () => {
      setDeferredPrompt((window as any).deferredPrompt);
    };

    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = deferredPrompt || (window as any).deferredPrompt;
    if (!promptEvent) {
      toast.info("O navegador ainda não liberou a instalação. Aguarde alguns segundos ou use o menu do Chrome.");
      return;
    }

    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log(`[PWA] Usuário escolheu: ${outcome}`);
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
    }
  };

  if (isInstalled) return null;

  const isFirefox = (typeof navigator !== 'undefined') && navigator.userAgent.toLowerCase().includes('firefox');

  if (isFirefox) {
    return (
      <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-600">
            <Smartphone size={16} />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Instalar no Firefox (Android)</p>
            <p className="text-[10px] text-muted-foreground">O Firefox requer instalação manual.</p>
          </div>
        </div>
        <div className="space-y-2 p-2 bg-orange-500/5 rounded-lg border border-orange-500/10">
          <p className="text-[10px] text-foreground font-medium">Siga os passos:</p>
          <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal pl-4">
            <li>Toque nos <strong>três pontinhos</strong> (menu) no canto do Firefox.</li>
            <li>Selecione a opção <strong>"Instalar"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</li>
            <li>Confirme a instalação e pronto!</li>
          </ol>
        </div>
      </div>
    );
  }

  if (!deferredPrompt) {
    // Se não há prompt, mas também não está instalado, mostramos um aviso de como fazer manual
    return (
      <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Smartphone size={16} />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Instalar no Celular</p>
            <p className="text-[10px] text-muted-foreground">O sistema funciona melhor se for instalado como aplicativo.</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          * Dica: Se o botão não aparecer, use a opção "Instalar Aplicativo" ou "Adicionar à tela inicial" no menu do seu navegador Chrome.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/100 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
          <Download size={20} />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Instalar WR Music App</p>
          <p className="text-xs text-muted-foreground">Acesse como um aplicativo real na sua tela inicial.</p>
        </div>
      </div>
      <Button 
        onClick={handleInstall}
        className="w-full h-10 rounded-xl bg-indigo-500/100 hover:bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-95"
      >
        INSTALAR AGORA
      </Button>
    </div>
  );
}
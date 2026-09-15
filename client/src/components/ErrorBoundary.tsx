import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// AUD-001 FIX: O ErrorBoundary não deve expor stack traces ou detalhes técnicos
// em produção. Somente em desenvolvimento (import.meta.env.DEV) o stack é visível.
const isDev = import.meta.env.DEV;

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Logs técnicos ficam apenas no servidor de monitoramento, nunca visíveis ao usuário.
    // Em produção, este log vai para o console do browser (visível somente em DevTools),
    // não para a interface do usuário.
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Ocorreu um erro inesperado.</h2>

            {/* AUD-001: Em produção, exibir apenas mensagem genérica.
                Em desenvolvimento, exibir o stack técnico para facilitar debug. */}
            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 text-center">
              {isDev ? (
                <pre className="text-sm text-muted-foreground whitespace-break-spaces text-left">
                  {this.state.error?.message}
                  {"\n\n"}
                  {this.state.error?.stack}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ocorreu um erro ao processar sua solicitação. Por favor, recarregue a página e tente novamente.
                  Se o problema persistir, entre em contato com o suporte.
                </p>
              )}
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;


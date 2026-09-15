import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, AlertCircle, Bot } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { SpreadsheetViewer } from "./SpreadsheetViewer";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string | Date;
};

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  isBlocked?: boolean;
  isCooldown?: boolean;
  cooldownSeconds?: number;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
};

function formatMessageTime(dateVal?: string | Date): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function validateMessage(msg: string): string | null {
  const raw = msg.trim();
  if (!raw) return null;
  return null;
}

export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  isBlocked = false,
  isCooldown = false,
  cooldownSeconds = 0,
  placeholder = "Digite sua mensagem...",
  className,
  height = "600px",
  emptyStateMessage = "Como posso ajudar você hoje?",
  suggestedPrompts,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const displayMessages = messages.filter((msg) => msg.role !== "system");

  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;
      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      });
    }
  };

  useEffect(() => {
    if (!input.trim()) { setValidationError(null); return; }
    const timer = setTimeout(() => setValidationError(validateMessage(input)), 400);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (displayMessages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [displayMessages.length, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || isBlocked || isCooldown) return;
    const error = validateMessage(trimmedInput);
    if (error) { setValidationError(error); return; }
    onSendMessage(trimmedInput);
    setInput("");
    setValidationError(null);
    scrollToBottom();
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const isDisabled = isLoading || isBlocked || isCooldown;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-background text-foreground rounded-2xl border border-border/60 shadow-xl overflow-hidden",
        className
      )}
      style={{ height }}
    >
      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden bg-gradient-to-b from-background to-muted/20">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20 shadow-lg">
                <Sparkles className="w-9 h-9 text-indigo-500" />
              </div>
              <div className="absolute -inset-2 bg-indigo-500/10 blur-xl rounded-full -z-10" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground mb-1">{emptyStateMessage}</p>
              <p className="text-sm text-muted-foreground">Faça uma pergunta ou escolha uma sugestão abaixo.</p>
            </div>
            {suggestedPrompts && suggestedPrompts.length > 0 && (
              <div className="flex max-w-2xl flex-wrap justify-center gap-2 mt-2">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => onSendMessage(prompt)}
                    disabled={isDisabled}
                    className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 px-4 py-2 text-sm text-indigo-700 dark:text-indigo-300 font-medium transition-all hover:border-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-6 p-4 sm:p-6">
              {displayMessages.map((message, index) => {
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight = isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3 w-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
                      message.role === "user" ? "justify-end items-end" : "justify-start items-end"
                    )}
                    style={shouldApplyMinHeight ? { minHeight: `${minHeightForLastMessage}px` } : undefined}
                  >
                    {/* Avatar da IA */}
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Bolha de Mensagem */}
                    <div
                      className={cn(
                        "max-w-[88%] md:max-w-[78%] min-w-0 break-words shadow-sm",
                        message.role === "user"
                          ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-indigo-500/25"
                          : "bg-card border border-border/60 text-foreground rounded-2xl rounded-bl-sm px-4 py-3"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none w-full prose-p:my-1.5 prose-headings:font-bold prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5">
                          {(() => {
                            const SPREADSHEET_REGEX = /<!--SPREADSHEET:\s*(\{[\s\S]*?\})\s*-->/g;
                            const matches = Array.from(message.content.matchAll(SPREADSHEET_REGEX));
                            if (matches.length > 0) {
                              const parts = message.content.split(SPREADSHEET_REGEX);
                              return parts.map((part, i) => {
                                if (matches.some(m => m[1] === part)) {
                                  return <SpreadsheetViewer key={i} jsonRaw={part} />;
                                }
                                return <Streamdown key={i}>{part}</Streamdown>;
                              });
                            }
                            return <Streamdown>{message.content}</Streamdown>;
                          })()}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                      )}

                      {/* Timestamp da mensagem */}
                      {message.createdAt && (
                        <div className={cn(
                          "text-[9px] font-semibold mt-1.5 flex items-center justify-end select-none",
                          message.role === "user" ? "text-indigo-200/70" : "text-muted-foreground/60"
                        )}>
                          {formatMessageTime(message.createdAt)}
                        </div>
                      )}
                    </div>

                    {/* Avatar do Usuário */}
                    {message.role === "user" && (
                      <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-md">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Loading indicator */}
              {isLoading && (
                <div
                  className="flex items-end gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                  style={minHeightForLastMessage > 0 ? { minHeight: `${minHeightForLastMessage}px` } : undefined}
                >
                  <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-card border border-border/60 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-indigo-500/70 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-indigo-500/40 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/60 bg-card/80 backdrop-blur-sm">
        {validationError && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-0">
            <AlertCircle size={13} className="text-rose-500 shrink-0" />
            <p className="text-xs text-rose-600 font-medium">{validationError}</p>
          </div>
        )}

        <form ref={inputAreaRef} onSubmit={handleSubmit} className="flex gap-3 p-4 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isDisabled}
              className={cn(
                "flex-1 max-h-36 resize-none min-h-[44px] rounded-xl border-border/60 bg-background focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500/50 transition-all text-sm pr-2",
                validationError && "border-rose-400 focus-visible:ring-rose-400"
              )}
              rows={1}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isDisabled || !!validationError}
            className="shrink-0 h-[44px] w-[44px] rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-md shadow-indigo-500/30 transition-all disabled:opacity-40 disabled:shadow-none"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground/60 text-center pb-3 px-4">
          Somente consultas válidas sobre sua escola &middot; Máx. 10 por dia &middot; Intervalo mínimo 10s entre envios
        </p>
      </div>
    </div>
  );
}

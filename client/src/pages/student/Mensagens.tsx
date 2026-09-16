import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * Chat direto aluno ↔ professor (respeita a permissão canSeeMessages do aluno).
 * O professor responde pelo painel administrativo (mesma tabela chatMessages).
 */
export default function StudentMessages() {
  const { data: profile, isLoading: isLoadingProfile } = trpc.studentPortal.getProfile.useQuery();
  const teacherId = (profile as any)?.teacherId as number | undefined;
  const teacherName = (profile as any)?.teacherName as string | undefined;
  const canSeeMessages = (profile as any)?.permissions?.canSeeMessages !== false;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");

  const utils = trpc.useUtils();

  const { data: messages = [], isLoading } = trpc.studentPortal.getMessages.useQuery(
    { withUserId: teacherId ?? 0 },
    {
      enabled: Boolean(teacherId) && canSeeMessages,
      refetchInterval: 15000,
    }
  );

  const markRead = trpc.chat.markAsRead.useMutation();
  const sendMessage = trpc.studentPortal.sendMessage.useMutation({
    onSuccess: () => {
      setText("");
      utils.studentPortal.getMessages.invalidate({ withUserId: teacherId ?? 0 });
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar a mensagem."),
  });

  useEffect(() => {
    if (!teacherId || messages.length === 0) return;
    const hasIncoming = messages.some((m: any) => m.senderId === teacherId && !m.isMe);
    if (hasIncoming) {
      markRead.mutate({ fromUserId: teacherId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const content = text.trim();
    if (!content || !teacherId || sendMessage.isPending) return;
    sendMessage.mutate({ receiverId: teacherId, content });
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!canSeeMessages) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <ShieldAlert size={48} className="text-muted-foreground" />
        <h1 className="text-2xl font-black text-foreground">Mensagens indisponíveis</h1>
        <p className="text-muted-foreground max-w-sm">
          O envio de mensagens não está habilitado para o seu acesso. Fale com a secretaria da escola.
        </p>
      </div>
    );
  }

  if (!teacherId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <MessageSquare size={48} className="text-muted-foreground" />
        <h1 className="text-2xl font-black text-foreground">Nenhum professor vinculado</h1>
        <p className="text-muted-foreground max-w-sm">
          Você ainda não tem um professor vinculado ao seu cadastro. Fale com a secretaria da escola.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] gap-4 pb-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Mensagens</h1>
        <p className="text-muted-foreground font-medium text-sm">
          Converse diretamente com {teacherName || "seu professor"}.
        </p>
      </div>

      <Card className="flex-1 border-none shadow-lg bg-card flex flex-col overflow-hidden">
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-primary" size={28} />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <MessageSquare size={40} className="text-muted-foreground opacity-30" />
                <p className="text-sm font-bold text-muted-foreground">
                  Nenhuma mensagem ainda. Envie a primeira!
                </p>
              </div>
            ) : (
              messages.map((message: any) => (
                <div
                  key={message.id}
                  className={cn("flex", message.isMe ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm",
                      message.isMe
                        ? "bg-indigo-600 text-white rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    <p className="text-sm font-medium whitespace-pre-wrap break-words">{message.content}</p>
                    <p
                      className={cn(
                        "text-[10px] font-bold mt-1",
                        message.isMe ? "text-indigo-200" : "text-muted-foreground"
                      )}
                    >
                      {message.createdAt ? format(new Date(message.createdAt), "dd/MM 'às' HH:mm") : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border p-3 sm:p-4 flex items-end gap-2 bg-card">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escreva sua mensagem..."
              rows={1}
              maxLength={2000}
              className="flex-1 resize-none bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all max-h-32"
            />
            <Button
              onClick={handleSend}
              disabled={!text.trim() || sendMessage.isPending}
              className="h-11 w-11 rounded-2xl shrink-0"
              title="Enviar mensagem"
            >
              {sendMessage.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

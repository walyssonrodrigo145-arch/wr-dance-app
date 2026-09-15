import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Megaphone, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Separator } from "@/components/ui/separator";

export default function CreateCampaign() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [messageText, setMessageText] = useState("Olá {{nome}}, tudo bem?");
  const [minDelay, setMinDelay] = useState(10);
  const [rawContacts, setRawContacts] = useState("");
  
  const createCampaign = trpc.marketing.createCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha criada com sucesso!");
      setLocation('/marketing');
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
    }
  });

  if (user?.role !== 'admin') {
    return <div className="p-8">Acesso Negado</div>;
  }

  const handleCreate = () => {
    if (!name.trim() || !messageText.trim() || !rawContacts.trim()) {
      toast.error("Preencha o nome, mensagem e contatos.");
      return;
    }

    // Parse simple CSV/List: name, phone
    const lines = rawContacts.split('\n').filter(l => l.trim().length > 0);
    const parsedContacts = lines.map(line => {
      const parts = line.split(',');
      const contactName = parts.length >= 2 ? parts[0].trim() : "Contato";
      const contactPhone = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
      return { 
        name: contactName, 
        phone: contactPhone, 
        messageText,
        variables: { nome: contactName }
      };
    }).filter(c => c.phone.length >= 8); // basic validation

    if (parsedContacts.length === 0) {
      toast.error("Nenhum contato válido encontrado. Formato esperado: Nome, Telefone");
      return;
    }

    createCampaign.mutate({
      name,
      description,
      mediaUrl: mediaUrl.trim() || undefined,
      minDelay,
      contacts: parsedContacts
    });
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto pb-32">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/marketing')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nova Campanha</h1>
          <p className="text-muted-foreground">Configure os detalhes e os contatos do disparo.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Campanha</CardTitle>
          <CardDescription>Defina o nome, imagem opcional e os intervalos de envio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Campanha</Label>
              <Input placeholder="Ex: Black Friday 2026" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Intervalo entre mensagens (segundos)</Label>
              <Input type="number" min="1" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>URL da Imagem / Mídia (Opcional)</Label>
            <Input placeholder="https://exemplo.com/sua-imagem.png" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">Cole o link direto da imagem (PNG, JPG, WebP). Se preenchido, a mensagem será enviada como imagem com legenda.</p>
          </div>

          <div className="space-y-2">
            <Label>Descrição (Interna)</Label>
            <Input placeholder="Detalhes adicionais..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contatos</CardTitle>
          <CardDescription>Cole os contatos no formato: <strong>Nome, 5511999999999</strong> (um por linha).</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea 
            placeholder={"João da Silva, 5511999999999\nMaria Clara, 5511888888888"} 
            className="min-h-[150px] font-mono text-sm"
            value={rawContacts}
            onChange={e => setRawContacts(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensagem</CardTitle>
          <CardDescription>Você pode usar a variável <strong>{`{{nome}}`}</strong> no texto.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea 
            placeholder="Sua mensagem aqui..." 
            className="min-h-[150px]"
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleCreate} disabled={createCampaign.isPending} className="gap-2">
          {createCampaign.isPending ? "Criando..." : <><Send className="w-4 h-4" /> Criar e Salvar</>}
        </Button>
      </div>
    </div>
  );
}

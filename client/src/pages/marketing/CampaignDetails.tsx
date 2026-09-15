import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Pause, CheckCircle2, AlertTriangle, Send, Clock, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CampaignDetails() {
  const [, params] = useRoute("/marketing/:id");
  const [, setLocation] = useLocation();
  const campaignId = parseInt(params?.id || "0", 10);

  const { data, refetch, isLoading } = trpc.marketing.getCampaignDetails.useQuery(
    { campaignId },
    { enabled: campaignId > 0, refetchInterval: 5000 }
  );

  const updateStatus = trpc.marketing.updateCampaignStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      refetch();
    },
    onError: (err) => toast.error(err.message)
  });

  const reactivate = trpc.marketing.reactivateCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha reativada e envios reiniciados!");
      refetch();
    },
    onError: (err) => toast.error(`Erro ao reativar: ${err.message}`)
  });

  const deleteCampaign = trpc.marketing.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha excluída!");
      setLocation('/marketing');
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err.message}`)
  });

  if (isLoading) return <div className="p-8">Carregando detalhes...</div>;
  if (!data?.campaign) return <div className="p-8">Campanha não encontrada.</div>;

  const { campaign, contacts, logs } = data;

  const handleReactivate = () => {
    if (confirm(`Deseja reativar a campanha "${campaign.name}"? Todos os contatos serão marcados para reenvio e as estatísticas serão zeradas.`)) {
      reactivate.mutate({ campaignId: campaign.id });
    }
  };

  const handleDelete = () => {
    if (confirm(`Tem certeza que deseja excluir a campanha "${campaign.name}"? Esta ação não pode ser desfeita.`)) {
      deleteCampaign.mutate({ campaignId: campaign.id });
    }
  };

  const progress = campaign.totalContacts > 0 
    ? Math.round((campaign.sentCount / campaign.totalContacts) * 100) 
    : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-blue-500">Em andamento</Badge>;
      case 'completed': return <Badge className="bg-green-500">Concluída</Badge>;
      case 'paused': return <Badge className="bg-orange-500">Pausada</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="secondary">Rascunho</Badge>;
    }
  };

  const getContactBadge = (status: string) => {
    switch (status) {
      case 'sent': return <Badge className="bg-green-500">Enviado</Badge>;
      case 'processing': return <Badge className="bg-blue-500">Processando</Badge>;
      case 'failed': return <Badge variant="destructive">Falha</Badge>;
      default: return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto pb-32">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/marketing')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              {getStatusBadge(campaign.status)}
              Criada em {format(new Date(campaign.createdAt), "dd MMM yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {campaign.status === 'paused' || campaign.status === 'draft' || campaign.status === 'error' ? (
            <Button onClick={() => updateStatus.mutate({ campaignId: campaign.id, status: 'running' })} className="gap-2">
              <Play className="w-4 h-4" /> {campaign.status === 'draft' ? "Iniciar Envio" : "Retomar Envio"}
            </Button>
          ) : campaign.status === 'running' ? (
            <Button variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-50" onClick={() => updateStatus.mutate({ campaignId: campaign.id, status: 'paused' })}>
              <Pause className="w-4 h-4 mr-2" /> Pausar
            </Button>
          ) : null}

          <Button variant="outline" onClick={handleReactivate} title="Reativar e Reenviar Campanha" className="gap-2 border-blue-500 text-blue-500 hover:bg-blue-50">
            Reativar & Reenviar
          </Button>

          <Button variant="destructive" onClick={handleDelete} title="Excluir Campanha">
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Progresso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">{progress}%</div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Contatos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.totalContacts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enviados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{campaign.sentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Falhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{campaign.failedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts" className="gap-2"><Send className="w-4 h-4" /> Contatos</TabsTrigger>
          <TabsTrigger value="logs" className="gap-2"><FileText className="w-4 h-4" /> Logs de Execução</TabsTrigger>
        </TabsList>
        
        <TabsContent value="contacts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro (se houver)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{getContactBadge(c.status)}</TableCell>
                      <TableCell className="text-red-500 text-sm max-w-xs truncate">{c.errorMessage}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(l.createdAt), "dd/MM HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.level === 'error' ? 'destructive' : 'outline'}>{l.level}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{l.message}</TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center py-4">Nenhum log registrado ainda.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

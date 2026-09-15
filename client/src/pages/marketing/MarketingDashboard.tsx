import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, ArrowRight, Play, Pause, CheckCircle2, AlertTriangle, Send, RotateCcw, Pencil, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import CrmKanban from "./CrmKanban";

export default function MarketingDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"campanhas" | "crm">("crm");
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMediaUrl, setEditMediaUrl] = useState("");
  const [editMinDelay, setEditMinDelay] = useState(10);
  const [editMessageText, setEditMessageText] = useState("");

  const utils = trpc.useUtils();

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold">Acesso Negado</h2>
        <p className="text-muted-foreground mt-2">Você não tem permissão para acessar o módulo de marketing.</p>
      </div>
    );
  }

  const { data: campaigns, refetch, isLoading } = trpc.marketing.getCampaigns.useQuery();

  const updateStatus = trpc.marketing.updateCampaignStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso!");
      refetch();
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
    }
  });

  const reactivate = trpc.marketing.reactivateCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha reativada! Os envios foram reiniciados.");
      refetch();
    },
    onError: (err) => {
      toast.error(`Erro ao reativar: ${err.message}`);
    }
  });

  const deleteCampaign = trpc.marketing.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha excluída com sucesso!");
      refetch();
    },
    onError: (err) => {
      toast.error(`Erro ao excluir: ${err.message}`);
    }
  });

  const editCampaign = trpc.marketing.editCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha atualizada com sucesso!");
      setEditingCampaign(null);
      refetch();
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar: ${err.message}`);
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-blue-500">Em andamento</Badge>;
      case 'completed': return <Badge className="bg-green-500">Concluída</Badge>;
      case 'paused': return <Badge className="bg-orange-500">Pausada</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="secondary">Rascunho</Badge>;
    }
  };

  const handleStatusChange = (campaignId: number, status: 'running' | 'paused') => {
    updateStatus.mutate({ campaignId, status });
  };

  const handleReactivate = (campaignId: number, name: string) => {
    if (confirm(`Deseja reativar a campanha "${name}"? Todos os contatos serão marcados para reenvio e as estatísticas serão zeradas.`)) {
      reactivate.mutate({ campaignId });
    }
  };

  const handleDelete = (campaignId: number, name: string) => {
    if (confirm(`Tem certeza que deseja excluir a campanha "${name}"? Esta ação não pode ser desfeita.`)) {
      deleteCampaign.mutate({ campaignId });
    }
  };

  const handleOpenEdit = async (c: any) => {
    setEditingCampaign(c);
    setEditName(c.name || "");
    setEditDescription(c.description || "");
    setEditMediaUrl(c.mediaUrl || "");
    setEditMinDelay(c.minDelay || 10);
    setEditMessageText("");

    try {
      const details = await utils.marketing.getCampaignDetails.fetch({ campaignId: c.id });
      if (details?.contacts && details.contacts.length > 0) {
        setEditMessageText(details.contacts[0].messageText || "");
      }
    } catch (e) {}
  };

  const handleSaveEdit = () => {
    if (!editingCampaign || !editName.trim()) return;
    editCampaign.mutate({
      campaignId: editingCampaign.id,
      name: editName.trim(),
      messageText: editMessageText.trim() || undefined,
      description: editDescription.trim() || undefined,
      mediaUrl: editMediaUrl.trim() || undefined,
      minDelay: editMinDelay,
    });
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="w-8 h-8 text-primary" />
            Marketing & CRM Comercial
          </h1>
          <p className="text-muted-foreground">Gerencie o funil de vendas dos alunos e envie mensagens em massa no WhatsApp.</p>
        </div>
        {activeTab === "campanhas" && (
          <Button onClick={() => setLocation('/marketing/nova')} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Campanha
          </Button>
        )}
      </div>

      {/* Seletor de Abas */}
      <div className="flex bg-muted/40 p-1.5 rounded-2xl w-fit border border-border/60 gap-1.5 shadow-sm">
        <button
          onClick={() => setActiveTab("crm")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold font-outfit uppercase tracking-wider transition-all",
            activeTab === "crm"
              ? "bg-primary text-white shadow-md shadow-primary/25"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <TrendingUp size={16} /> Funil Comercial (CRM)
        </button>
        <button
          onClick={() => setActiveTab("campanhas")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold font-outfit uppercase tracking-wider transition-all",
            activeTab === "campanhas"
              ? "bg-primary text-white shadow-md shadow-primary/25"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Megaphone size={16} /> Disparos WhatsApp
        </button>
      </div>

      {activeTab === "crm" ? (
        <CrmKanban />
      ) : (
        <>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Campanhas</CardTitle>
            <Megaphone className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Enviado</CardTitle>
            <Send className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns?.reduce((acc, c) => acc + c.sentCount, 0) || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Concluídas</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns?.filter(c => c.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Falhas Recentes</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {campaigns?.reduce((acc, c) => acc + c.failedCount, 0) || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas Recentes</CardTitle>
          <CardDescription>Gerencie suas campanhas de envio.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4">Carregando...</TableCell></TableRow>
                ) : campaigns?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Nenhuma campanha criada.</TableCell></TableRow>
                ) : (
                  campaigns?.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{format(new Date(c.createdAt), "dd 'de' MMM, yyyy", { locale: ptBR })}</TableCell>
                      <TableCell>{getStatusBadge(c.status)}</TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {c.sentCount} / {c.totalContacts} ({c.totalContacts > 0 ? Math.round((c.sentCount / c.totalContacts) * 100) : 0}%)
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {c.status === 'paused' || c.status === 'draft' || c.status === 'error' ? (
                          <Button size="icon" variant="outline" onClick={() => handleStatusChange(c.id, 'running')} title="Iniciar/Retomar">
                            <Play className="w-4 h-4 text-green-500" />
                          </Button>
                        ) : c.status === 'running' ? (
                          <Button size="icon" variant="outline" onClick={() => handleStatusChange(c.id, 'paused')} title="Pausar">
                            <Pause className="w-4 h-4 text-orange-500" />
                          </Button>
                        ) : null}

                        {/* Botão de Reativar / Reenviar */}
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleReactivate(c.id, c.name)}
                          title="Reativar e Reenviar Campanha"
                        >
                          <RotateCcw className="w-4 h-4 text-blue-500" />
                        </Button>

                        {/* Botão de Editar */}
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleOpenEdit(c)}
                          title="Editar Campanha"
                        >
                          <Pencil className="w-4 h-4 text-amber-500" />
                        </Button>

                        {/* Botão de Excluir */}
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleDelete(c.id, c.name)}
                          title="Excluir Campanha"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>

                        {/* Botão de Detalhes */}
                        <Button size="icon" variant="ghost" onClick={() => setLocation(`/marketing/${c.id}`)} title="Ver Detalhes">
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </>
      )}

      {/* Modal de Edição de Campanha - Refinado pelo Layout Especialista */}
      <Dialog open={!!editingCampaign} onOpenChange={(open) => !open && setEditingCampaign(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-6 overflow-hidden rounded-2xl shadow-2xl border border-border/60 backdrop-blur-md">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="text-xl font-bold font-outfit flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Editar Campanha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 overflow-y-auto pr-2 flex-1 max-h-[60vh] custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome da Campanha</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Ex: Lançamento MusicPro" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Intervalo (seg)</Label>
                <Input type="number" min="1" value={editMinDelay} onChange={e => setEditMinDelay(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Texto da Mensagem</Label>
              <Textarea 
                value={editMessageText} 
                onChange={e => setEditMessageText(e.target.value)} 
                placeholder="Digite a mensagem do WhatsApp (use {{nome}} para personalizar)" 
                className="min-h-[140px] max-h-[220px] text-sm font-sans leading-relaxed resize-y border-border/80 focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL da Imagem / Mídia (Opcional)</Label>
              <Input value={editMediaUrl} onChange={e => setEditMediaUrl(e.target.value)} placeholder="https://exemplo.com/imagem.png" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição Interna</Label>
              <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Notas ou observações da campanha..." />
            </div>
          </div>
          <DialogFooter className="pt-3 border-t flex flex-row items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingCampaign(null)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={editCampaign.isPending} className="rounded-xl gap-2 font-semibold">
              {editCampaign.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

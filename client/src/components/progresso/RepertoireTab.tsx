import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Music, Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown,
  Eye, Award, Youtube, ExternalLink, FileText, Download, Play, ArrowRightLeft,
} from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { VideoFacade } from "@/components/ui/VideoFacade";
import { VideoThumb } from "@/components/ui/VideoThumb";
import { youtubeEmbedSrc } from "@/lib/youtubeEmbed";

/**
 * PRD Repertório — Aba do professor no Progresso.
 * Cadastro/edição/exclusão/reordenação de músicas do YouTube por aluno.
 */
export function RepertoireTab({ studentId, studentName }: { studentId: number; studentName?: string }) {
  const utils = trpc.useUtils();
  // Caça-Bug: erro visível em vez de estado vazio enganoso (ex: FORBIDDEN de professor não-dono)
  const { data: items = [], isLoading, error } = trpc.repertoire.list.useQuery({ studentId });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<{
    youtubeUrl: string; title: string; description: string;
    chordSheet: string; chordKey: string; cifraclubUrl: string;
    chordDiagrams: Array<{ name: string; mount: string; tuning: string }>;
  }>({ youtubeUrl: "", title: "", description: "", chordSheet: "", chordKey: "", cifraclubUrl: "", chordDiagrams: [] });

  const invalidate = () => utils.repertoire.list.invalidate({ studentId });

  const importMutation = trpc.repertoire.importCifraClub.useMutation({
    onSuccess: (data) => {
      setForm((f) => ({
        ...f,
        chordSheet: data.chordSheet,
        chordKey: data.chordKey || f.chordKey,
        cifraclubUrl: data.sourceUrl,
        chordDiagrams: data.diagrams,
      }));
      toast.success(`Cifra importada — ${data.diagrams.length} diagrama(s). Sem letra, conforme a política do sistema.`);
    },
    onError: (e) => toast.error(e.message || "Erro ao importar a cifra."),
  });

  const createMutation = trpc.repertoire.create.useMutation({
    onSuccess: (data) => {
      // Caça-Bug: o toast DIZ para quem a música foi — elimina a dúvida clássica
      toast.success(`Música adicionada ao repertório de ${data?.studentName || "aluno"}!`);
      invalidate();
      setFormOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao adicionar a música."),
  });
  const updateMutation = trpc.repertoire.update.useMutation({
    onSuccess: () => {
      toast.success("Música atualizada!");
      invalidate();
      setFormOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar a música."),
  });
  const deleteMutation = trpc.repertoire.delete.useMutation({
    onSuccess: () => {
      toast.success("Música removida do repertório.");
      invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao remover a música."),
  });
  const moveMutation = trpc.repertoire.move.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message || "Erro ao reordenar."),
  });

  // Caça-Bug: o professor não tinha como ABRIR a música — player embutido no painel
  // (Erro 153: host padrão youtube.com; alternativo nocookie via toggle no modal)
  const [playing, setPlaying] = useState<any>(null);
  const [altHost, setAltHost] = useState(false);
  const playSrc = (item: any, alt = false) => youtubeEmbedSrc(item.videoId, item.playlistId, alt);

  // Mover para outro aluno (correção de destino)
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<any>(null);
  const { data: allStudents = [] } = trpc.students.list.useQuery();
  const moveStudentMutation = trpc.repertoire.moveToStudent.useMutation({
    onSuccess: (data) => {
      toast.success(`Música movida para o repertório de ${data?.targetName || "aluno"}!`);
      invalidate();
      setMoveOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao mover a música."),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ youtubeUrl: "", title: "", description: "", chordSheet: "", chordKey: "", cifraclubUrl: "", chordDiagrams: [] });
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      youtubeUrl: item.youtubeUrl || "",
      title: item.title || "",
      description: item.description || "",
      chordSheet: item.chordSheet || "",
      chordKey: item.chordKey || "",
      cifraclubUrl: item.cifraclubUrl || "",
      chordDiagrams: Array.isArray(item.chordDiagrams) ? item.chordDiagrams : [],
    });
    setFormOpen(true);
  };

  const submit = () => {
    if (!form.youtubeUrl.trim()) {
      toast.error("Cole o link do YouTube.");
      return;
    }
    // Campos de cifra SEMPRE enviados ("": limpa no server — sanitize converte para null)
    const chordPayload = {
      chordSheet: form.chordSheet,
      chordKey: form.chordKey,
      cifraclubUrl: form.cifraclubUrl,
      chordDiagrams: form.chordDiagrams,
    };
    if (editing) {
      const { chordDiagrams, ...rest } = form;
      updateMutation.mutate({ id: editing.id, ...rest, ...chordPayload });
    } else {
      createMutation.mutate({ studentId, ...form, ...chordPayload });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 bg-pink-500 rounded-full shrink-0" />
          <div>
            <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tighter leading-tight">
              Repertório{studentName ? ` de ${studentName}` : " do Aluno"}
            </h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-bold mt-0.5">
              Músicas do YouTube que o aluno executa dentro do MusicPro (aba Materiais)
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="h-10 px-4 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-pink-500/20 transition-all active:scale-95 cursor-pointer w-fit"
        >
          <Plus size={15} /> Adicionar Música
        </button>
      </div>

      {/* Lista */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-black text-foreground">Não foi possível carregar o repertório</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[380px]">{error.message}</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-card/40 overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-2/3 bg-muted rounded" />
                <div className="h-2 w-1/2 bg-muted/70 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-card/30 rounded-2xl border border-dashed border-border/50">
          <div className="w-14 h-14 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-500 mb-3">
            <Music size={26} />
          </div>
          <p className="text-sm font-black text-foreground">Nenhuma música no repertório</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[320px]">
            Adicione o primeiro link do YouTube — o aluno escuta pelo portal, sem sair do MusicPro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((item: any, idx: number) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
              className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-md overflow-hidden shadow-2xl shadow-primary/5 hover:border-pink-500/40 hover:shadow-pink-500/10 hover:-translate-y-1 transition-all duration-500 group"
            >
              {/* Thumbnail + play (fallback sempre atrás da imagem) */}
              <div className="aspect-video bg-muted/50 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-rose-600/20">
                  <Youtube size={36} className="text-pink-500/60" />
                </div>
                {item.videoId && (
                  <VideoThumb
                    videoId={item.videoId}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
                <button
                  onClick={() => { const src = playSrc(item); if (src) setPlaying({ ...item, src, studentName }); else toast.error("Link sem vídeo/playlist válido."); }}
                  title="Assistir (player embutido)"
                  className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center cursor-pointer"
                >
                  <span className="w-11 h-11 rounded-full bg-white/95 text-pink-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl translate-y-1 group-hover:translate-y-0">
                    <Play size={18} className="fill-current translate-x-0.5" />
                  </span>
                </button>
                <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                  {(item.chordSheet || item.cifraclubUrl) && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-600/90 text-white flex items-center gap-1">
                      <FileText size={9} /> Cifra
                    </span>
                  )}
                  {!item.viewedAt && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-pink-600 text-white">Nova</span>
                  )}
                  {item.viewedAt && !item.learnedAt && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/90 text-white flex items-center gap-1">
                      <Eye size={9} /> Ouvida
                    </span>
                  )}
                  {item.learnedAt && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/90 text-white flex items-center gap-1">
                      <Award size={9} /> Aprendida
                    </span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-foreground truncate">{item.title}</h4>
                    <p className="text-[9px] text-muted-foreground font-bold mt-0.5">
                      {item.viewedAt ? `Ouvida em ${format(new Date(item.viewedAt), "dd/MM/yyyy")}` : `Adicionada em ${format(new Date(item.createdAt), "dd/MM/yyyy")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      title="Mover para cima"
                      onClick={() => moveMutation.mutate({ id: item.id, direction: "up" })}
                      className="w-8 h-8 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      title="Mover para baixo"
                      onClick={() => moveMutation.mutate({ id: item.id, direction: "down" })}
                      className="w-8 h-8 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
                {item.description && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => { const src = playSrc(item); if (src) setPlaying({ ...item, src, studentName }); else toast.error("Link sem vídeo/playlist válido."); }}
                    className="flex-1 h-9 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Play size={12} className="fill-current" /> Assistir
                  </button>
                  <a
                    href={item.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir no YouTube"
                    className="h-9 w-9 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                  >
                    <ExternalLink size={12} />
                  </a>
                  <button
                    onClick={() => openEdit(item)}
                    className="flex-1 h-9 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Pencil size={11} /> Editar
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remover "${item.title}" do repertório? Esta ação é definitiva.`)) deleteMutation.mutate({ id: item.id }); }}
                    className="h-9 w-9 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    title="Remover definitivamente"
                  >
                    {deleteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal Adicionar/Editar */}
      <ResponsiveDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Editar Música" : "Adicionar Música ao Repertório"}
        description="Cole o link do YouTube — o aluno executa pelo portal, sem abrir o YouTube"
      >
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Link do YouTube <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.youtubeUrl}
              onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
              maxLength={2000}
              className="w-full h-11 rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-pink-500/20"
            />
            <p className="text-[9px] text-muted-foreground">Aceita watch?v=, youtu.be, Shorts e playlists</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Título</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Sons naturais — Estudo 1 (opcional)"
              maxLength={255}
              className="w-full h-11 rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-pink-500/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Orientação pedagógica</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              maxLength={2000}
              placeholder="Ex: ouvir 2x antes da próxima aula; prestar atenção no groove da mão esquerda"
              className="w-full rounded-xl border border-border/60 bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-pink-500/20 resize-none"
            />
          </div>
          {/* ── Cifra (PRD Cifra — RN-007: só acordes, sem letra) ── */}
          <div className="space-y-2.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <FileText size={12} className="text-indigo-500" /> Cifra (acordes e estrutura — sem letra)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  value={form.chordKey}
                  onChange={(e) => setForm({ ...form, chordKey: e.target.value.slice(0, 4) })}
                  placeholder="Tom (Ex: Em)"
                  maxLength={4}
                  className="w-24 h-8 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Importação do Cifra Club */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                value={form.cifraclubUrl || ""}
                onChange={(e) => setForm({ ...form, cifraclubUrl: e.target.value })}
                placeholder="Link da cifra no Cifra Club (opcional)"
                className="flex-1 min-w-[180px] h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => {
                  if (!form.cifraclubUrl.trim()) {
                    toast.error("Cole o link da cifra do Cifra Club.");
                    return;
                  }
                  importMutation.mutate({ url: form.cifraclubUrl });
                }}
                disabled={importMutation.isPending}
                className={cn(
                  "h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0",
                  importMutation.isPending && "opacity-60 cursor-not-allowed"
                )}
              >
                {importMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                Importar
              </button>
            </div>

            <textarea
              value={form.chordSheet}
              onChange={(e) => setForm({ ...form, chordSheet: e.target.value })}
              rows={7}
              maxLength={50000}
              placeholder={"[Intro] Em   A   C   G\n\n[Refrão] G   D   Em   C"}
              className="w-full rounded-xl border border-border/60 bg-background p-3 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500/20 resize-y"
            />
            <p className="text-[9px] text-muted-foreground leading-snug">
              Cole acordes no formato clássico (sem letra). A importação extrai acordes, tom e diagramas — a letra nunca é armazenada.
              {form.chordDiagrams.length > 0 && (
                <span className="text-indigo-500 font-black"> {form.chordDiagrams.length} diagrama(s) prontos.</span>
              )}
            </p>
          </div>

          {/* ── Mover para outro aluno (correção de destino) ── */}
          {editing && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <ArrowRightLeft size={12} className="text-amber-500" /> Mover esta música para outro aluno
              </label>
              <div className="flex gap-1.5">
                <select
                  value={moveTarget?.id ? String(moveTarget.id) : ""}
                  onChange={(e) => setMoveTarget(allStudents.find((s: any) => String(s.id) === e.target.value) || null)}
                  className="flex-1 h-10 rounded-xl border border-border/60 bg-background px-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="">Selecione o aluno de destino...</option>
                  {allStudents
                    .filter((s: any) => s.id !== editing.studentId)
                    .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!moveTarget) { toast.error("Selecione o aluno de destino."); return; }
                    if (confirm(`Mover "${editing.title}" para o repertório de ${moveTarget.name}?`)) {
                      moveStudentMutation.mutate({ id: editing.id, targetStudentId: moveTarget.id });
                    }
                  }}
                  disabled={moveStudentMutation.isPending || !moveTarget}
                  className={cn(
                    "h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0",
                    (moveStudentMutation.isPending || !moveTarget) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {moveStudentMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightLeft size={12} />}
                  Mover
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground">A música sai do repertório atual (o status Nova/Ouvida/Aprendida é reiniciado no destino).</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setFormOpen(false)}
              className="h-11 px-4 bg-muted/20 hover:bg-muted/30 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className={cn(
                "flex-1 h-11 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-pink-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                (createMutation.isPending || updateMutation.isPending) && "opacity-60 cursor-not-allowed"
              )}
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {editing ? "Salvar Alterações" : "Adicionar"}
            </button>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Player embutido do professor (Caça-Bug: antes não havia como abrir a música) */}
      <ResponsiveDialog
        open={!!playing}
        onOpenChange={(o) => { if (!o) setPlaying(null); }}
        title={playing?.title || "Música"}
        description={playing?.studentName ? `Repertório de ${playing.studentName}` : "Executando pelo MusicPro"}
      >
        <div className="pt-1">
          {/* Capa antes do iframe (Erro 153/fundo branco) — iframe só após o play */}
          <VideoFacade
            key={playing?.id ?? "player"}
            videoId={playing?.videoId ?? null}
            title={playing?.title || "Player de música"}
            embedSrc={playing?.src ?? null}
          />
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            {playing?.youtubeUrl && (
              <a
                href={playing.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink size={11} /> Abrir no YouTube →
              </a>
            )}
            <button
              type="button"
              onClick={() => setPlaying((p: any) => ({ ...p, src: youtubeEmbedSrc(p.videoId, p.playlistId, true) }))}
              className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors ml-auto"
              title="Se o vídeo não abrir, troque o host do player"
            >
              Não abriu? Usar player alternativo
            </button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

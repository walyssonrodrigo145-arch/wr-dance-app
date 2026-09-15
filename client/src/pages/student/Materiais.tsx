import { trpc } from "@/lib/trpc";
import { getFixedUrl } from "@/lib/utils";
import { 
  Search, 
  Filter, 
  LayoutGrid, 
  List,
  FileText,
  Video,
  Music,
  Download,
  Play,
  Eye,
  MoreVertical,
  Archive,
  ExternalLink,
  Info,
  Loader2,
  X,
  MessageCircle,
  Send,
  Maximize2,
  FileWarning
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import MediaLightbox from "@/components/student/MediaLightbox";
import { RepertoireSection } from "@/components/student/RepertoireSection";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

export default function StudentMaterials() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todos");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewFile, setPreviewFile] = useState<any>(null);
  // URL resolvida (pode ser um token temporário para arquivos locais)
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [urlLoading, setUrlLoading] = useState(false);
  // FILE-NOT-FOUND FIX: flag do server (arquivo físico ausente no disco) — antes era
  // ignorada e o iframe recebia src="" (tela em branco sem explicação para o aluno).
  const [fileNotFound, setFileNotFound] = useState(false);
  // ZOOM FIX: lightbox para ampliar imagens (botão Ampliar / duplo clique)
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Comments UI state
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");

  const utils = trpc.useUtils();
  const { data: materials, isLoading } = trpc.studentPortal.getMaterials.useQuery();
  const markViewedMutation = trpc.studentPortal.markMaterialViewed.useMutation();
  const getFileUrlMutation = trpc.studentPortal.getFileUrl.useMutation();

  const { data: comments } = trpc.fileComments.list.useQuery(
    { fileId: previewFile?.id },
    { enabled: !!previewFile?.id && showComments }
  );
  
  const createCommentMutation = trpc.fileComments.create.useMutation({
    onSuccess: () => {
      utils.fileComments.list.invalidate({ fileId: previewFile?.id });
      setNewComment("");
    }
  });

  const handlePreview = async (file: any) => {
    setPreviewFile(file);
    setFileNotFound(false);
    setLightboxOpen(false);
    setResolvedUrl(getFixedUrl(file.fileUrl)); // mostra de imediato; será substituído
    setUrlLoading(true);
    markViewedMutation.mutate({ fileId: file.id });
    try {
      const result = await getFileUrlMutation.mutateAsync({ fileId: file.id });
      if ((result as any).fileNotFound) {
        // Arquivo físico não existe no servidor (ex.: rebuild sem volume persistente)
        setFileNotFound(true);
        setResolvedUrl("");
      } else {
        setResolvedUrl((result as any).url || getFixedUrl(file.fileUrl));
      }
    } catch {
      // fallback: usa a URL original (funciona quando o armazenamento é externo)
      setResolvedUrl(getFixedUrl(file.fileUrl));
    } finally {
      setUrlLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewFile(null);
    setResolvedUrl("");
    setFileNotFound(false);
    setLightboxOpen(false);
    setShowComments(false);
  };


  const filteredMaterials = materials?.filter(m => {
    const matchesSearch = m.fileName.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "todos" || 
                          (category === "pdf" && (m.category === "pdf" || m.category === "documento")) ||
                          m.category === category;
    return matchesSearch && matchesCategory;
  }) || [];

  // Group by folder
  const groupedMaterials = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredMaterials.forEach(m => {
      const folder = m.folder || "Outros";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(m);
    });
    return groups;
  }, [filteredMaterials]);

  const categories = [
    { id: 'todos', label: 'Todos', icon: Archive },
    { id: 'pdf', label: 'Apostilas', icon: FileText },
    { id: 'video', label: 'Vídeos', icon: Video },
    { id: 'audio', label: 'Áudios', icon: Music },
  ];

  const getIcon = (cat: string) => {
    switch (cat) {
      case 'video': return <Video size={32} className="text-pink-500" />;
      case 'audio': return <Music size={32} className="text-emerald-500" />;
      case 'pdf': return <FileText size={32} className="text-blue-500" />;
      default: return <FileText size={32} className="text-slate-500" />;
    }
  };

  const getActionLabel = (cat: string) => {
    switch (cat) {
      case 'video': return 'Assistir';
      case 'audio': return 'Ouvir';
      case 'pdf': return 'Visualizar';
      default: return 'Visualizar';
    }
  };

  // PDF-like: categoria pdf/documento OU fallback por extensão .pdf no nome
  // (coberta a inconsistência de uploads antigos categorizados como 'documento')
  const isPdfLike = !!(previewFile && (
    previewFile.category === 'pdf' ||
    previewFile.category === 'documento' ||
    (!previewFile.category && previewFile.fileName?.toLowerCase().endsWith('.pdf'))
  ));

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-10 pb-10 max-w-[1400px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest border border-primary/20">
            <Archive size={12} />
            Biblioteca de Estudos
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">Meus Materiais</h1>
          <p className="text-muted-foreground text-sm max-w-xl font-medium">
            Sua central de estudos com todas as partituras, vídeos e áudios compartilhados para acelerar sua evolução.
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-2xl border border-border/50 shadow-sm backdrop-blur-md">
          <button 
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold",
              viewMode === "grid" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <LayoutGrid size={16} /> Grade
          </button>
          <button 
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold",
              viewMode === "list" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <List size={16} /> Lista
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-card/40 p-4 rounded-[2rem] border border-border/50 backdrop-blur-sm shadow-xl shadow-black/5">
        <div className="md:col-span-5 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="O que você está procurando?" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background/50 border border-border/50 rounded-2xl py-4 pl-14 pr-6 text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary/50 outline-none transition-all shadow-inner"
          />
        </div>

        <div className="md:col-span-7 flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
          <div className="w-px h-10 bg-border/50 mx-2 hidden md:block" />
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border shrink-0",
                category === cat.id 
                  ? "bg-primary text-white border-primary shadow-xl shadow-primary/20 -translate-y-0.5" 
                  : "bg-background/40 text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-background/80"
              )}
            >
              <cat.icon size={16} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* PRD Repertório — músicas do YouTube indicadas pelo professor (player embutido) */}
      <RepertoireSection />

      {/* Materials Display Grouped by Folder */}
      {category === 'video' ? (
        <div className="space-y-12">
          {Object.entries(groupedMaterials).map(([folderName, filesInFolder]) => (
            <div key={folderName} className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-8 w-2 bg-indigo-600 rounded-full shadow-lg shadow-indigo-500/20"></div>
                <h3 className="text-lg md:text-xl font-black text-foreground tracking-tight">{folderName}</h3>
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md tracking-widest border border-indigo-100/50">{filesInFolder.length} VÍDEOS</span>
              </div>
              
              <div className="flex overflow-x-auto pb-8 pt-2 -mx-4 px-4 md:-mx-8 md:px-8 snap-x gap-4 md:gap-6 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {filesInFolder.map((item: any) => (
                  <motion.div 
                    key={item.id}
                    whileHover={{ scale: 1.02, y: -4 }}
                    onClick={() => handlePreview(item)}
                    className="flex-none w-[280px] md:w-[340px] bg-card border border-border rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group shadow-sm hover:shadow-2xl hover:shadow-indigo-500/20 transition-all cursor-pointer relative snap-start shrink-0 flex flex-col"
                  >
                     <div className="aspect-video bg-muted/50 relative overflow-hidden flex flex-col items-center justify-center">
                       {item.thumbnailUrl ? (
                         <img 
                           src={getFixedUrl(item.thumbnailUrl)} 
                           alt={item.fileName}
                           className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                         />
                       ) : (
                         <>
                           <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-20 transition-transform duration-700 group-hover:scale-110" />
                           <div className="relative z-10 p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl transition-transform duration-700 group-hover:scale-110 text-indigo-500">
                             <Video className="w-10 h-10" />
                           </div>
                         </>
                       )}
                       
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                         <div className="w-14 h-14 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transform scale-75 group-hover:scale-100 transition-transform duration-300">
                           <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
                         </div>
                       </div>
                       
                       <div className="absolute top-4 left-4 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[9px] text-white font-black tracking-widest flex items-center gap-1.5 shadow-xl">
                          <Video size={10} /> VÍDEO AULA
                       </div>
                     </div>
                     
                     <div className="p-5 flex-1 flex flex-col bg-gradient-to-b from-card to-muted/10">
                        <h4 className="text-sm font-black text-foreground tracking-tight line-clamp-2 leading-tight">{item.fileName}</h4>
                        <div className="mt-auto pt-4 flex items-center justify-between">
                           <span className="text-[10px] font-bold text-muted-foreground/60">
                              {(item.size ? (item.size / 1024 / 1024).toFixed(1) : 0)} MB
                           </span>
                           {item.viewedAt && (
                             <span className="text-[9px] font-bold text-green-600 flex items-center gap-1">
                               <Eye size={12} /> {format(new Date(item.viewedAt), "dd MMM")}
                             </span>
                           )}
                        </div>
                     </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        Object.entries(groupedMaterials).map(([folderName, filesInFolder]) => (
          <div key={folderName} className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-primary border-b pb-2">
              <Archive size={24} /> {folderName}
            </h2>
            <motion.div 
              variants={container}
              initial="hidden"
              animate="show"
              className={cn(
                "grid gap-8",
                viewMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
              )}
            >
              <AnimatePresence mode='popLayout'>
                {filesInFolder.map((item: any) => (
                  <motion.div 
                    layout
                    variants={item}
                    key={item.id}
                    className="group"
                  >
                    <Card className={cn(
                      "h-full border border-border/50 shadow-xl bg-card/60 backdrop-blur-md hover:shadow-2xl hover:border-primary/30 transition-all duration-500 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden flex flex-col",
                      viewMode === "list" && "flex-col sm:flex-row h-auto sm:h-32 items-start sm:items-center"
                    )}>
                      <CardContent className="p-0 flex flex-col sm:flex-row h-full flex-1 w-full">
                        {/* Media Section */}
                        <div 
                          onClick={() => handlePreview(item)}
                          className={cn(
                          "relative overflow-hidden shrink-0 cursor-pointer",
                          viewMode === "grid" ? "aspect-[16/10] w-full" : "w-full h-32 sm:w-40 sm:h-full border-b sm:border-b-0 sm:border-r border-border/30"
                        )}>
                          {/* Background Pattern/Color */}
                          {(item.category === 'imagem' || item.thumbnailUrl) ? (
                            <img 
                              src={getFixedUrl(item.thumbnailUrl || item.fileUrl)} 
                              alt={item.fileName}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                          ) : (
                            <>
                              <div className={cn(
                                "absolute inset-0 opacity-20 transition-transform duration-700 group-hover:scale-110",
                                item.category === 'video' ? "bg-gradient-to-br from-pink-500 to-rose-600" :
                                item.category === 'audio' ? "bg-gradient-to-br from-emerald-500 to-teal-600" :
                                "bg-gradient-to-br from-blue-500 to-indigo-600"
                              )} />
                              {/* Icon Centered */}
                              <div className="absolute inset-0 flex items-center justify-center opacity-40 transition-all duration-500 group-hover:opacity-100 group-hover:scale-110">
                                <div className={cn(
                                  "p-4 md:p-6 rounded-[2rem] bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all group-hover:bg-white/20",
                                  item.category === 'video' ? "text-pink-500" :
                                  item.category === 'audio' ? "text-emerald-500" :
                                  "text-blue-500"
                                )}>
                                  {getIcon(item.category)}
                                </div>
                              </div>
                            </>
                          )}
                          
                          {/* Floating Badge */}
                          <div className="absolute top-4 left-4 z-10">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 backdrop-blur-md border",
                              item.category === 'video' ? "bg-pink-500/10 text-pink-600 border-pink-500/20" :
                              item.category === 'audio' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                              "bg-blue-500/10 text-blue-600 border-blue-500/20"
                            )}>
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                item.category === 'video' ? "bg-pink-500" :
                                item.category === 'audio' ? "bg-emerald-500" :
                                "bg-blue-500"
                              )} />
                              {item.category}
                            </span>
                          </div>
                        </div>
  
                        {/* Info Section */}
                        <div className={cn(
                          "p-6 md:p-8 flex flex-col flex-1 gap-4 md:gap-6 min-w-0 w-full",
                          viewMode === "list" && "flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 gap-3 sm:gap-4"
                        )}>
                          <div className="space-y-2 md:space-y-3 min-w-0 flex-1 w-full">
                            <div className="flex items-center gap-3">
                               <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-md">
                                {format(new Date(item.createdAt), "dd MMM yyyy", { locale: ptBR })}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-border" />
                              <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                {(item.size ? (item.size / 1024 / 1024).toFixed(1) : 0)} MB
                              </span>
                            </div>
                            
                            <h3 className="text-lg md:text-xl font-bold text-foreground group-hover:text-primary transition-colors truncate tracking-tight leading-snug">
                              {item.fileName}
                            </h3>
                            
                          </div>
  
                          <div className={cn(
                            "flex items-center gap-2 md:gap-3 w-full sm:w-auto",
                            viewMode === "grid" ? "w-full" : "shrink-0 mt-2 sm:mt-0"
                          )}>
                            <Button 
                              onClick={() => handlePreview(item)}
                              className="flex-1 sm:flex-none h-12 md:h-14 rounded-xl md:rounded-2xl bg-primary text-white font-bold text-xs shadow-xl shadow-primary/20 hover:scale-[1.03] active:scale-95 transition-all border-none gap-2 md:gap-3 px-4 md:px-6"
                            >
                              {item.category === 'video' ? <Play size={16} fill="currentColor" /> : 
                               item.category === 'audio' ? <Music size={16} /> : 
                               <Eye size={16} />}
                              {getActionLabel(item.category)}
                            </Button>
                            
                            <Button 
                              asChild
                              variant="outline"
                              className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-background border-border/50 text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center shrink-0 shadow-sm"
                            >
                              <a href={getFixedUrl(item.fileUrl)} target="_blank" rel="noopener noreferrer" download={item.fileName}>
                                <Download size={18} />
                              </a>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        ))
      )}

      {filteredMaterials.length === 0 && (
        <div className="text-center py-32 bg-card/20 rounded-[3rem] border-2 border-dashed border-border/50 col-span-full mt-10">
          <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Archive className="text-muted-foreground/30" size={48} />
          </div>
          <h3 className="text-2xl font-bold text-foreground">Nada por aqui ainda</h3>
          <p className="text-muted-foreground font-medium mt-3 max-w-xs mx-auto">Não encontramos materiais com esses filtros. Tente buscar por outros termos.</p>
          <Button 
            variant="outline" 
            onClick={() => { setSearch(""); setCategory("todos"); }}
            className="mt-8 rounded-xl px-8 border-primary/30 text-primary hover:bg-primary/5 font-bold"
          >
            Limpar Filtros
          </Button>
        </div>
      )}

      {/* Footer / CTA Section */}
      <div className="pt-12 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-border/30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground/50">
            <Info size={20} />
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em]">
            Exibindo <span className="text-primary font-bold">{filteredMaterials.length}</span> de <span className="font-bold">{materials?.length || 0}</span> arquivos
          </p>
        </div>
      </div>

      {/* PREVIEW DIALOG */}
       <Dialog open={!!previewFile} onOpenChange={handleClosePreview}>
          <DialogContent showCloseButton={false} onPointerDownOutside={(e) => { if (lightboxOpen) e.preventDefault(); }} className={cn("p-0 overflow-hidden bg-background border-none rounded-[1.5rem] md:rounded-[3rem] shadow-2xl transition-all", showComments ? "max-w-[95vw] md:max-w-7xl" : "max-w-[95vw] md:max-w-5xl")}>
             <DialogHeader className="p-4 md:p-6 bg-card/80 backdrop-blur-xl border-b border-border/50">
                {/* LAYOUT FIX: ações com flex-wrap + título truncando — nunca estoura a largura do modal */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
                   <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-widest border border-primary/20">
                           {previewFile?.category}
                        </span>
                        <span className="text-[9px] md:text-[10px] text-muted-foreground font-bold uppercase tracking-widest truncate">
                           Visualização de Material • {previewFile?.category?.toUpperCase()}
                        </span>
                     </div>
                     <DialogTitle className="text-base md:text-lg lg:text-xl font-black text-foreground tracking-tight truncate leading-tight">
                        {previewFile?.fileName}
                     </DialogTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto lg:justify-end shrink-0">
                    {previewFile?.category === 'imagem' && !urlLoading && !fileNotFound && (
                      <Button 
                        variant="outline"
                        className="h-11 rounded-xl text-primary border-primary/20 bg-primary/5 text-[10px] md:text-xs font-bold px-3 md:px-4 shadow-sm hover:scale-105 active:scale-95"
                        onClick={() => setLightboxOpen(true)}
                        title="Ampliar imagem"
                      >
                         <Maximize2 size={16} className="md:mr-2" /> 
                         <span className="hidden md:inline">Ampliar</span>
                      </Button>
                    )}
                    <Button 
                      variant="outline"
                      className="h-11 rounded-xl text-primary border-primary/20 bg-primary/5 text-[10px] md:text-xs font-bold px-3 md:px-4 shadow-sm hover:scale-105 active:scale-95"
                      onClick={() => setShowComments(!showComments)}
                      title="Dúvidas e Comentários"
                    >
                       <MessageCircle size={16} className="md:mr-2" /> 
                       <span className="hidden md:inline">Dúvidas e Comentários</span>
                    </Button>
                    <Button 
                       asChild
                       variant="outline"
                       className="h-11 rounded-xl border-border/80 hover:bg-muted text-[10px] md:text-xs font-bold px-3 md:px-4 shadow-sm transition-all hidden sm:flex"
                     >
                        <a href={resolvedUrl || getFixedUrl(previewFile?.fileUrl)} target="_blank" rel="noopener noreferrer">
                           <ExternalLink size={16} className="md:mr-2" /> 
                           <span className="hidden md:inline">Nova Aba</span>
                        </a>
                     </Button>
                    <Button 
                      asChild
                      className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-white text-[10px] md:text-xs font-bold px-3 md:px-4 shadow-xl shadow-primary/20 border-none transition-all hover:scale-105 active:scale-95 hidden sm:flex"
                    >
                       <a href={resolvedUrl || getFixedUrl(previewFile?.fileUrl)} target="_blank" rel="noopener noreferrer" download={previewFile?.fileName}>
                          <Download size={16} className="md:mr-2" /> 
                          <span className="hidden md:inline">Baixar Arquivo</span>
                       </a>
                    </Button>
                    <button 
                      onClick={handleClosePreview}
                      className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground flex items-center justify-center transition-all shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
               </div>
            </DialogHeader>

            <div className="flex flex-col md:flex-row h-[70vh] bg-muted/30">
               {/* Content Rendering */}
               <div className={cn("h-full flex items-center justify-center relative z-10 transition-all p-4 md:p-0", showComments ? "w-full md:w-2/3" : "w-full")}>
                 {urlLoading && (
                   <div className="flex flex-col items-center gap-4 text-muted-foreground">
                     <Loader2 size={40} className="animate-spin text-primary" />
                     <p className="text-sm font-semibold">Carregando arquivo...</p>
                   </div>
                 )}
                 {/* FILE-NOT-FOUND: estado vazio explicativo — nunca renderizar iframe/src vazio */}
                 {!urlLoading && fileNotFound && (
                   <div className="flex flex-col items-center gap-5 text-center px-8 max-w-md">
                     <div className="w-20 h-20 rounded-[1.5rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                       <FileWarning size={36} />
                     </div>
                     <div className="space-y-2">
                       <p className="text-base font-black text-foreground">Arquivo não encontrado no servidor</p>
                       <p className="text-sm text-muted-foreground font-medium">Este material não está mais disponível no armazenamento. Solicite ao professor o reenvio do arquivo.</p>
                     </div>
                   </div>
                 )}
                 {!urlLoading && !fileNotFound && previewFile?.category === 'video' && (
                    <div className="relative w-full h-full flex items-center justify-center">
                       <video 
                         ref={videoRef}
                         src={resolvedUrl} 
                         controls 
                         className="max-h-[90%] max-w-[100%] md:max-w-[95%] rounded-xl md:rounded-2xl shadow-2xl bg-black"
                         autoPlay
                       />
                       {/* FULLSCREEN FIX: ampliar vídeo em ambientes sem botão nativo */}
                       {typeof document !== "undefined" && document.fullscreenEnabled && (
                         <button 
                           type="button"
                           onClick={() => { videoRef.current?.requestFullscreen?.().catch(() => {}); }}
                           className="absolute top-3 right-3 md:top-4 md:right-4 w-10 h-10 rounded-xl bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all active:scale-95"
                           title="Tela cheia"
                         >
                           <Maximize2 size={16} />
                         </button>
                       )}
                    </div>
                 )}
                 {!urlLoading && !fileNotFound && previewFile?.category === 'audio' && (
                    <div className="flex flex-col items-center gap-6 md:gap-10 w-full max-w-2xl px-6 py-10 md:px-12 md:py-20 bg-card rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-border/50">
                       <div className="w-24 h-24 md:w-40 md:h-40 rounded-[2rem] md:rounded-[3rem] bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-primary/30 relative">
                          <Music size={48} className="relative z-10 md:w-16 md:h-16" />
                          <div className="absolute inset-0 bg-white/20 rounded-full animate-ping opacity-20" />
                       </div>
                       <div className="text-center space-y-2 w-full px-2">
                          <p className="text-xs md:text-sm font-bold text-primary uppercase tracking-[0.2em]">Reproduzindo Áudio</p>
                          <p className="text-sm md:text-xl font-bold text-foreground truncate w-full">{previewFile.fileName}</p>
                       </div>
                       <audio 
                         src={resolvedUrl} 
                         controls 
                         className="w-full h-12 md:h-14 custom-audio-player"
                         autoPlay
                       />
                    </div>
                 )}
                 {!urlLoading && !fileNotFound && isPdfLike && (
                    <div className="w-full h-full flex flex-col">
                       <iframe 
                         src={`${resolvedUrl}#toolbar=0`} 
                         className="w-full flex-1 min-h-0 border-none"
                         title={previewFile.fileName}
                       />
                       {/* PDF FALLBACK FIX: Android WebView/PWA não renderiza PDF em iframe —
                           ações diretas sempre acessíveis no mobile */}
                       <div className="flex sm:hidden items-center justify-center gap-3 p-3 border-t border-border/50 bg-card">
                          <a 
                            href={resolvedUrl || getFixedUrl(previewFile?.fileUrl)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 h-11 px-5 rounded-xl border border-primary/20 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest"
                          >
                             <ExternalLink size={14} /> Abrir em nova aba
                          </a>
                          <a 
                            href={resolvedUrl || getFixedUrl(previewFile?.fileUrl)} 
                            download={previewFile?.fileName}
                            className="flex items-center gap-2 h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                          >
                             <Download size={14} /> Baixar PDF
                          </a>
                       </div>
                    </div>
                 )}
                  {!urlLoading && !fileNotFound && previewFile?.category === 'imagem' && (
                     <div className="relative w-full h-full flex items-center justify-center p-4 md:p-8 overflow-hidden">
                        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.45]" style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
                        <img
                          src={resolvedUrl}
                          alt={previewFile.fileName}
                          onDoubleClick={() => setLightboxOpen(true)}
                          className="relative max-h-full max-w-full object-contain rounded-xl md:rounded-2xl shadow-2xl border border-border/50 cursor-zoom-in"
                        />
                       <button 
                         type="button"
                         onClick={() => setLightboxOpen(true)}
                         className="absolute bottom-3 right-3 md:bottom-4 md:right-4 flex items-center gap-2 h-10 px-4 rounded-xl bg-black/60 hover:bg-black/80 text-white text-[10px] font-black uppercase tracking-widest backdrop-blur-md border border-white/20 transition-all active:scale-95"
                       >
                         <Maximize2 size={14} /> Ampliar
                       </button>
                    </div>
                 )}
                 {/* Formato sem renderer (ex.: upload antigo com categoria inválida) */}
                 {!urlLoading && !fileNotFound && previewFile && !isPdfLike && !['video','audio','imagem'].includes(previewFile.category) && (
                   <div className="flex flex-col items-center gap-5 text-center px-8 max-w-md">
                     <div className="w-20 h-20 rounded-[1.5rem] bg-muted border border-border flex items-center justify-center text-muted-foreground">
                       <FileText size={36} />
                     </div>
                     <div className="space-y-2">
                       <p className="text-base font-black text-foreground">Pré-visualização não disponível</p>
                       <p className="text-sm text-muted-foreground font-medium">Este formato não pode ser exibido aqui. Use a opção abaixo para abrir ou baixar o arquivo.</p>
                     </div>
                     <a 
                       href={resolvedUrl || getFixedUrl(previewFile.fileUrl)} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                     >
                       <Download size={14} /> Abrir / Baixar
                     </a>
                   </div>
                 )}
               </div>

               {/* Comments Sidebar */}
               {showComments && (
                 <div className="w-full md:w-1/3 h-full bg-card border-l border-border/50 flex flex-col shadow-inner">
                   <div className="p-4 border-b border-border/50 bg-muted/20 font-bold text-sm">
                     Comentários e Dúvidas
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-4">
                     {comments?.map((comment: any) => (
                       <div key={comment.id} className={cn(
                         "p-3 rounded-2xl max-w-[85%] text-sm",
                         comment.userId === user?.id 
                          ? "bg-primary text-white ml-auto rounded-tr-sm" 
                          : "bg-muted text-foreground mr-auto rounded-tl-sm"
                       )}>
                         <div className="font-bold text-[10px] opacity-70 mb-1">{comment.userName}</div>
                         <div>{comment.content}</div>
                       </div>
                     ))}
                     {comments?.length === 0 && (
                       <p className="text-center text-muted-foreground text-sm py-10">Nenhum comentário ainda. Faça uma pergunta sobre o material!</p>
                     )}
                   </div>
                   <div className="p-4 bg-background border-t border-border/50 flex gap-2">
                     <Input 
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        placeholder="Digite sua dúvida..."
                        className="rounded-full bg-muted/50 border-none"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newComment.trim()) {
                            createCommentMutation.mutate({ fileId: previewFile.id, content: newComment });
                          }
                        }}
                     />
                     <Button 
                       size="icon" 
                       className="rounded-full shrink-0"
                       disabled={!newComment.trim() || createCommentMutation.isPending}
                       onClick={() => createCommentMutation.mutate({ fileId: previewFile.id, content: newComment })}
                     >
                       <Send size={16} />
                     </Button>
                   </div>
                 </div>
               )}
             </div>
          </DialogContent>
       </Dialog>

       {/* ZOOM FIX: lightbox fullscreen com zoom/pan para imagens */}
       <MediaLightbox
          open={lightboxOpen}
          src={resolvedUrl || getFixedUrl(previewFile?.fileUrl)}
          alt={previewFile?.fileName}
          onClose={() => setLightboxOpen(false)}
       />
     </div>
  );
}

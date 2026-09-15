import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { getFixedUrl, cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Loader2,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Folder,
  UploadCloud,
  File,
  Download,
  Filter,
  LayoutGrid,
  Trash2,
  Activity,
  Play,
  ExternalLink,
  X,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MediaLightbox from "@/components/student/MediaLightbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";

const generateVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } else {
        reject(new Error("Canvas context failed"));
      }
      URL.revokeObjectURL(video.src);
    };
    video.onerror = (e) => reject(e);
  });
};

export function BibliotecaMusical({ studentId }: { studentId: number }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todos");
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [fileNotFound, setFileNotFound] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploadComments, setUploadComments] = useState("");
  
  const utils = trpc.useUtils();
  const { data: allFiles = [] } = trpc.musicLibrary.list.useQuery({ studentId, category: 'todos', search: '' });
  const { data: files = [], isLoading } = trpc.musicLibrary.list.useQuery({ studentId, category, search });
  
  const getFileUrlMutation = trpc.musicLibrary.getFileUrl.useMutation();

  const handleOpenPreview = async (file: any) => {
    setPreviewFile(file);
    setFileNotFound(false);
    setResolvedUrl(getFixedUrl(file.fileUrl));
    setUrlLoading(true);
    try {
      const res = await getFileUrlMutation.mutateAsync({ fileId: file.id });
      if (res.fileNotFound) {
        setFileNotFound(true);
      } else if (res.url) {
        setResolvedUrl(res.url);
      }
    } catch {
      setResolvedUrl(getFixedUrl(file.fileUrl));
    } finally {
      setUrlLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewFile(null);
    setResolvedUrl("");
    setFileNotFound(false);
  };
  
  const uploadMutation = trpc.musicLibrary.upload.useMutation();
  const createMutation = trpc.musicLibrary.create.useMutation({
    onSuccess: () => {
      utils.musicLibrary.list.invalidate({ studentId });
      toast.success("Material adicionado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao adicionar material: " + e.message)
  });

  const deleteMutation = trpc.musicLibrary.delete.useMutation({
    onSuccess: () => {
      utils.musicLibrary.list.invalidate({ studentId });
      toast.success("Material excluído!");
    },
    onError: (e) => toast.error("Erro ao excluir material: " + e.message)
  });

  // MOBILE FIX: confirmação leve + caminho único de exclusão (acessível sem hover)
  const handleDeleteFile = (id: number) => {
    if (window.confirm("Excluir este material? Esta ação não pode ser desfeita.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setUploadName(file.name);
    setUploadFolder("");
    setUploadComments("");
    setUploadModalOpen(true);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmUpload = async () => {
    if (!uploadFile) return;
    
    const toastId = toast.loading(`Enviando ${uploadName}...`);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          
          let fileCategory: 'imagem' | 'video' | 'pdf' | 'audio' | 'documento' = 'documento';
          if (uploadFile.type.startsWith('image/')) fileCategory = 'imagem';
          else if (uploadFile.type.startsWith('video/')) fileCategory = 'video';
          else if (uploadFile.type.startsWith('audio/')) fileCategory = 'audio';
          else if (uploadFile.type === 'application/pdf') fileCategory = 'pdf';

          let thumbData: string | undefined = undefined;
          if (fileCategory === 'video') {
            try {
              thumbData = await generateVideoThumbnail(uploadFile);
            } catch (err) {
              console.warn("Could not generate thumbnail for video", err);
            }
          }

          const uploadResult = await uploadMutation.mutateAsync({
            fileName: uploadName,
            fileType: uploadFile.type,
            base64Data,
            thumbnailData: thumbData,
          });

          await createMutation.mutateAsync({
            studentId,
            fileName: uploadName,
            fileType: uploadFile.type,
            category: fileCategory,
            folder: uploadFolder || undefined,
            fileUrl: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnailUrl,
            size: uploadFile.size,
            comments: uploadComments || undefined,
          });

          toast.dismiss(toastId);
          setUploadModalOpen(false);
          setUploadFile(null);
          setUploadName("");
          setUploadFolder("");
          setUploadComments("");
        } catch (err: any) {
          toast.error("Erro no processamento: " + err.message, { id: toastId });
        }
      };
      reader.onerror = () => toast.error("Erro ao ler arquivo", { id: toastId });
      reader.readAsDataURL(uploadFile);
    } catch (error: any) {
      toast.error("Falha no upload: " + error.message, { id: toastId });
    }
  };


  const categories = [
    { id: "imagem", label: "Imagens", icon: ImageIcon, color: "text-purple-500", bg: "bg-purple-50" },
    { id: "video", label: "Vídeos", icon: Video, color: "text-rose-500", bg: "bg-rose-50" },
    { id: "pdf", label: "PDFs", icon: FileText, color: "text-blue-500", bg: "bg-blue-50" },
    { id: "audio", label: "Áudios", icon: Music, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
       {/* HEADER DA BIBLIOTECA */}
       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
             <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">Biblioteca Musical</h3>
             <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-1">Central de Mídia e Materiais de Apoio</p>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
             <div className="hidden lg:flex flex-col items-end mr-4">
                <div className="flex items-center gap-2 mb-1">
                   <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Armazenamento</span>
                   <span className="text-[9px] font-black text-indigo-600">LIMITADO</span>
                </div>
                <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden border border-border/50">
                   <div className="h-full bg-indigo-600 w-1/3" />
                </div>
             </div>
             <input 
               type="file" 
               ref={fileInputRef} 
               className="hidden" 
               onChange={handleFileUpload}
               accept="image/*,video/*,audio/*,.pdf"
             />
             <Button 
               onClick={() => fileInputRef.current?.click()}
               disabled={createMutation.isPending || uploadMutation.isPending}
               className="h-11 rounded-xl px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest gap-2 shadow-xl shadow-indigo-500/10 border-none w-full sm:w-auto justify-center"
             >
                {(createMutation.isPending || uploadMutation.isPending) ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Novo Material
             </Button>
          </div>
       </div>

       {/* ÁREA DE UPLOAD (DRAG & DROP) */}
        <motion.div 
          onClick={() => fileInputRef.current?.click()}
          whileHover={{ borderColor: "#6366F1", backgroundColor: "rgba(99, 102, 241, 0.02)" }}
          className="relative p-8 md:p-12 border-2 border-dashed border-border rounded-[2rem] md:rounded-[3rem] bg-card flex flex-col items-center justify-center text-center group cursor-pointer transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center mb-4 md:mb-6 shadow-2xl shadow-indigo-500/40 relative z-10 group-hover:scale-110 transition-transform">
             <UploadCloud className="w-8 h-8 md:w-10 md:h-10" />
          </div>
          <h4 className="text-base md:text-lg font-black text-foreground tracking-tight relative z-10 mb-2">Upload de Arquivos</h4>
          <p className="text-xs text-muted-foreground font-medium max-w-[240px] relative z-10">
            Arraste seus PDFs, Vídeos ou Áudios aqui ou <span className="text-indigo-600 font-bold underline">clique para selecionar</span>
          </p>
          
          <div className="flex gap-4 mt-8 opacity-40 group-hover:opacity-100 transition-opacity relative z-10">
             {[ImageIcon, Video, FileText, Music].map((Icon, i) => (
               <div key={i} className="w-10 h-10 rounded-xl bg-muted/50 border border-slate-100 flex items-center justify-center text-muted-foreground group-hover:text-indigo-500 group-hover:border-indigo-100 transition-all">
                  <Icon size={18} />
               </div>
             ))}
          </div>
       </motion.div>

       {/* CATEGORIAS E FILTROS */}
       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {categories.map((cat) => (
            <motion.div 
              key={cat.id}
              whileHover={{ y: -5 }}
              onClick={() => setCategory(cat.id === category ? 'todos' : cat.id)}
              className={cn(
                "bg-card p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border transition-all flex items-center gap-3 md:gap-4 group cursor-pointer",
                category === cat.id ? "border-indigo-600 shadow-lg ring-2 ring-indigo-500/10" : "border-border shadow-sm"
              )}
            >
               <div className={cn("w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:rotate-12", cat.bg, cat.color)}>
                  <cat.icon className="w-5 h-5 md:w-6 md:h-6" />
               </div>
               <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-tight">{cat.label}</p>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                    {allFiles.filter((f: any) => f.category === cat.id).length} arquivos
                  </p>
               </div>
            </motion.div>
          ))}
       </div>

       {/* BUSCA E RESULTADOS */}
       <div className="space-y-8">
          <div className="flex items-center justify-between">
             <div className="relative flex-1 max-w-md group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-indigo-600 transition-colors" size={16} />
                <Input 
                  placeholder="Pesquisar na biblioteca..." 
                  className="pl-12 h-12 bg-card border-border rounded-2xl text-xs font-bold"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
             </div>
             <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl border border-border bg-card text-muted-foreground"><Filter size={18} /></Button>
                <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl border border-border bg-card text-muted-foreground"><LayoutGrid size={18} /></Button>
             </div>
          </div>

          {category === 'video' ? (
             <div className="space-y-12 mt-4">
               {isLoading ? (
                 <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-indigo-500/20" /></div>
               ) : files.length === 0 ? (
                 <div className="py-20 text-center border border-dashed border-border rounded-[2rem] md:rounded-[3rem]">
                    <Video size={40} className="mx-auto text-slate-100 mb-4" />
                    <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhum vídeo nesta biblioteca</p>
                 </div>
               ) : (
                 Object.entries(files.reduce((acc: any, file: any) => {
                   const folder = file.folder || "Sem Pasta";
                   if (!acc[folder]) acc[folder] = [];
                   acc[folder].push(file);
                   return acc;
                 }, {})).map(([folderName, folderFiles]: [string, any]) => (
                   <div key={folderName} className="space-y-4">
                      <div className="flex items-center gap-3 px-2">
                        <div className="h-8 w-2 bg-indigo-600 rounded-full shadow-lg shadow-indigo-500/20"></div>
                        <h3 className="text-lg md:text-xl font-black text-foreground tracking-tight">{folderName}</h3>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md tracking-widest border border-indigo-100/50">{folderFiles.length} VÍDEOS</span>
                      </div>
                      
                      <div className="flex overflow-x-auto pb-8 pt-2 -mx-4 px-4 md:-mx-8 md:px-8 snap-x gap-4 md:gap-6 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                         {folderFiles.map((file: any) => (
                           <motion.div 
                             key={file.id}
                             whileHover={{ scale: 1.02, y: -4 }}
                             onClick={() => handleOpenPreview(file)}
                             className="flex-none w-[280px] md:w-[340px] bg-card border border-border rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group shadow-sm hover:shadow-2xl hover:shadow-indigo-500/20 transition-all cursor-pointer relative snap-start shrink-0 flex flex-col"
                           >
                              <div className="aspect-video bg-muted/50 relative overflow-hidden flex flex-col items-center justify-center">
                                {file.thumbnailUrl ? (
                                  <img 
                                    src={getFixedUrl(file.thumbnailUrl)} 
                                    alt={file.fileName}
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
                                
                                {/* Overlay Play */}
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
                                 <h4 className="text-sm font-black text-foreground tracking-tight line-clamp-2 leading-tight">{file.fileName}</h4>
                                 {file.comments && (
                                   <p className="text-[10px] text-muted-foreground font-medium line-clamp-2 mt-2 leading-relaxed">{file.comments}</p>
                                 )}
                                 <div className="mt-auto pt-4 flex items-center justify-between">
                                     <span className="text-[10px] font-bold text-muted-foreground/60">
                                        {(file.size ? (file.size / (1024 * 1024)).toFixed(1) : "0.5")} MB
                                     </span>
                                     <Button 
                                        variant="ghost" 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                                        disabled={deleteMutation.isPending}
                                        className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors p-0 active:scale-95"
                                     >
                                        {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                     </Button>
                                  </div>
                              </div>
                           </motion.div>
                         ))}
                      </div>
                   </div>
                 ))
               )}
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {isLoading ? (
                <div className="col-span-full py-20 flex justify-center"><Loader2 className="animate-spin text-indigo-500/20" /></div>
              ) : files.length === 0 ? (
                <div className="col-span-full py-20 text-center border border-dashed border-border rounded-[2rem] md:rounded-[3rem]">
                   <Folder size={40} className="mx-auto text-slate-100 mb-4" />
                   <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">Sua biblioteca está vazia</p>
                </div>
              ) : (
                files.map((file) => (
                  <motion.div 
                    key={file.id}
                    whileHover={{ y: -8 }}
                    onClick={() => handleOpenPreview(file)}
                    className="bg-card border border-border rounded-[2rem] md:rounded-[2.5rem] overflow-hidden group shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 transition-all flex flex-col cursor-pointer"
                  >
                      <div className="aspect-[4/3] bg-muted/50 relative flex items-center justify-center group-hover:bg-indigo-500/10/50 transition-colors overflow-hidden">
                        {(file.category === 'imagem' || file.thumbnailUrl) ? (
                          <img 
                            src={getFixedUrl(file.thumbnailUrl || file.fileUrl)} 
                            alt={file.fileName}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            onError={(e) => {
                              // Se a imagem falhar ao carregar (ex: arquivo não existe no disco), esconde a tag e mostra placeholder
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        {(!(file.category === 'imagem' || file.thumbnailUrl)) && (
                          <>
                            <div className={cn(
                              "absolute inset-0 opacity-20 transition-transform duration-700 group-hover:scale-110",
                              file.category === 'pdf' ? "bg-gradient-to-br from-blue-500 to-indigo-600" :
                              file.category === 'audio' ? "bg-gradient-to-br from-emerald-500 to-teal-600" :
                              "bg-gradient-to-br from-slate-500 to-slate-600"
                            )} />
                            <div className={cn(
                              "relative z-10 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl transition-transform duration-700 group-hover:scale-110",
                              file.category === 'pdf' ? "text-blue-500" :
                              file.category === 'audio' ? "text-emerald-500" :
                              "text-slate-500"
                            )}>
                              {file.category === 'pdf' && <FileText className="w-10 h-10 md:w-14 md:h-14" />}
                              {file.category === 'audio' && <Music className="w-10 h-10 md:w-14 md:h-14" />}
                              {file.category !== 'pdf' && file.category !== 'audio' && <File className="w-10 h-10 md:w-14 md:h-14" />}
                            </div>
                          </>
                        )}
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-all flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 z-20">
                           {/* Central Play/View Button */}
                           <button 
                             onClick={() => handleOpenPreview(file)}
                             className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 hover:bg-indigo-500 transition-all border-none focus:outline-none"
                           >
                              {file.category === 'audio' || file.category === 'video' ? (
                                <Play fill="currentColor" size={24} className="ml-1" />
                              ) : (
                                <Activity size={24} />
                              )}
                           </button>

                           {/* Top Right Quick Actions */}
                           <div className="absolute top-3 right-3 flex gap-2">
                              <a 
                                href={file.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                download={file.fileName}
                                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white/90 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
                                title="Download"
                              >
                                 <Download size={14} />
                              </a>
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                                 disabled={deleteMutation.isPending}
                                 className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white/90 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                 title="Excluir Arquivo"
                               >
                                  {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                               </button>
                           </div>
                        </div>
                        
                        <div className="absolute top-5 left-5 px-3 py-1.5 bg-card/90 backdrop-blur rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm">
                           {format(new Date(file.createdAt), "dd MMM")}
                        </div>
                     </div>
                     
                     <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-3 mb-2">
                           <div className="min-w-0 flex-1">
                              <h4 className="text-[11px] font-black text-foreground uppercase tracking-tight truncate">{file.fileName}</h4>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                 <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-muted/50 border border-slate-100">
                                    {file.category}
                                 </span>
                                 {file.folder && (
                                   <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100">
                                     {file.folder}
                                   </span>
                                 )}
                                 <span className="text-[9px] font-bold text-muted-foreground/40">
                                    {(file.size ? (file.size / (1024 * 1024)).toFixed(1) : "0.5")} MB
                                 </span>
                              </div>
                           </div>
                           {/* MOBILE FIX: ações sempre visíveis (touch não tem hover) */}
                           <div className="shrink-0 flex items-center gap-1.5">
                              <a 
                                href={getFixedUrl(file.fileUrl)} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                download={file.fileName}
                                onClick={(e) => e.stopPropagation()}
                                title="Download"
                                className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-indigo-600 hover:text-white active:scale-95 transition-all"
                              >
                                 <Download size={15} />
                              </a>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                                disabled={deleteMutation.isPending}
                                title="Excluir Arquivo"
                                className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white active:scale-95 transition-all"
                              >
                                 {deleteMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                              </button>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                           {file.viewedAt && (
                             <span title="Visualizado pelo aluno" className="text-[9px] font-bold text-green-600 flex items-center gap-1">
                               👁️ Visualizado em {format(new Date(file.viewedAt), "dd/MM")}
                             </span>
                           )}
                        </div>
                        {file.comments && (
                          <div className="mt-4 p-3 bg-muted/30 rounded-xl border border-border/50 text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
                            {file.comments}
                          </div>
                        )}
                     </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
       </div>

       {/* MODAL DE UPLOAD DE ARQUIVOS */}
       <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden bg-card border-none rounded-[2rem] shadow-2xl">
             <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/20">
                <DialogTitle className="text-xl font-black text-foreground uppercase tracking-tight flex items-center gap-3">
                   <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                      <UploadCloud size={20} />
                   </div>
                   Novo Material
                </DialogTitle>
             </DialogHeader>
             
             <div className="p-6 space-y-6">
                {uploadFile && (
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/50 border border-border/50">
                     <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
                        {uploadFile.type.startsWith('image/') ? <ImageIcon size={20} /> :
                         uploadFile.type.startsWith('video/') ? <Video size={20} /> :
                         uploadFile.type.startsWith('audio/') ? <Music size={20} /> :
                         <FileText size={20} />}
                     </div>
                     <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground truncate">{uploadFile.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">
                          {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                     </div>
                  </div>
                )}

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Nome do Arquivo</label>
                   <Input 
                      value={uploadName} 
                      onChange={e => setUploadName(e.target.value)} 
                      placeholder="Nome para exibição..."
                      className="h-12 bg-background border-border rounded-xl font-semibold"
                   />
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Pasta / Módulo (Opcional)</label>
                   <Input 
                      value={uploadFolder} 
                      onChange={e => setUploadFolder(e.target.value)} 
                      placeholder="Ex: Módulo 1, Repertório..."
                      className="h-12 bg-background border-border rounded-xl font-semibold"
                   />
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Observações / Links (Opcional)</label>
                   <Textarea 
                      value={uploadComments} 
                      onChange={e => setUploadComments(e.target.value)} 
                      placeholder="Adicione instruções, links extras ou detalhes sobre este material..."
                      className="min-h-[100px] bg-background border-border rounded-xl resize-none font-medium text-sm leading-relaxed"
                   />
                </div>
             </div>

             <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 flex gap-3">
                <Button 
                   variant="ghost" 
                   onClick={() => setUploadModalOpen(false)}
                   className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-muted"
                >
                   Cancelar
                </Button>
                <Button 
                   onClick={handleConfirmUpload}
                   disabled={uploadMutation.isPending || createMutation.isPending}
                   className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20"
                >
                   {(uploadMutation.isPending || createMutation.isPending) ? <Loader2 size={16} className="animate-spin mr-2" /> : <UploadCloud size={16} className="mr-2" />}
                   Salvar e Enviar
                </Button>
             </DialogFooter>
          </DialogContent>
       </Dialog>

        {/* MODAL DE PREVIEW DE ARQUIVOS */}
         <Dialog open={!!previewFile} onOpenChange={handleClosePreview}>
            <DialogContent showCloseButton={false} onPointerDownOutside={(e) => { if (lightboxOpen) e.preventDefault(); }} className="w-[96vw] max-w-6xl h-[90vh] max-h-[92vh] p-0 flex flex-col overflow-hidden bg-card/95 backdrop-blur-2xl border border-border/80 rounded-[2rem] shadow-2xl shadow-black/40 z-50">
              <div className="p-4 sm:p-5 bg-card/90 border-b border-border/60 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
                 <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                       "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border shadow-sm",
                       (previewFile?.category === 'pdf' || previewFile?.fileName?.toLowerCase().endsWith('.pdf'))
                          ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                          : previewFile?.category === 'video'
                          ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                          : previewFile?.category === 'audio'
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    )}>
                       {(previewFile?.category === 'pdf' || previewFile?.fileName?.toLowerCase().endsWith('.pdf')) && <FileText size={20} />}
                       {previewFile?.category === 'video' && <Video size={20} />}
                       {previewFile?.category === 'audio' && <Music size={20} />}
                       {previewFile?.category === 'imagem' && <ImageIcon size={20} />}
                       {previewFile?.category !== 'pdf' && previewFile?.category !== 'video' && previewFile?.category !== 'audio' && previewFile?.category !== 'imagem' && !previewFile?.fileName?.toLowerCase().endsWith('.pdf') && <File size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                       <DialogTitle className="text-sm sm:text-base font-black text-foreground uppercase tracking-tight truncate max-w-[120px] sm:max-w-md md:max-w-xl">
                          {previewFile?.fileName}
                       </DialogTitle>
                       <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                          Visualização de Material • {previewFile?.category?.toUpperCase() || "PDF"}
                       </p>
                    </div>
                 </div>

                 <div className="flex items-center gap-2 shrink-0">
                    <Button 
                      asChild
                      variant="outline"
                      className="h-9 sm:h-10 rounded-xl border-border/80 bg-background/50 hover:bg-muted font-bold text-[11px] uppercase tracking-wider px-3 sm:px-4 shadow-sm"
                    >
                       <a href={resolvedUrl || getFixedUrl(previewFile?.fileUrl)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={14} className="sm:mr-1.5" /> <span className="hidden sm:inline">Nova Aba</span>
                       </a>
                    </Button>
                    <Button 
                      asChild
                      className="h-9 sm:h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-black uppercase tracking-wider px-3 sm:px-5 shadow-lg shadow-indigo-500/20"
                    >
                       <a href={resolvedUrl || getFixedUrl(previewFile?.fileUrl)} target="_blank" rel="noopener noreferrer" download={previewFile?.fileName}>
                          <Download size={14} className="sm:mr-1.5" /> <span className="hidden sm:inline">Baixar Arquivo</span><span className="sm:hidden">Baixar</span>
                       </a>
                    </Button>
                    <button 
                      onClick={handleClosePreview}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-muted/60 hover:bg-muted active:scale-95 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all border border-border/60 ml-1 shrink-0"
                      title="Fechar"
                    >
                      <X size={18} />
                    </button>
                 </div>
              </div>

              <div className="flex-1 w-full h-full min-h-0 bg-muted/20 relative flex items-center justify-center overflow-hidden">
                 {urlLoading && (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground z-20">
                       <Loader2 size={36} className="animate-spin text-indigo-600" />
                       <p className="text-xs font-bold uppercase tracking-wider">Carregando visualização...</p>
                    </div>
                 )}

                 {fileNotFound && !urlLoading && (
                    <div className="z-10 flex flex-col items-center gap-3 p-8 text-center max-w-md">
                       <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                          <FileText size={32} />
                       </div>
                       <p className="text-sm font-bold text-foreground">Arquivo físico não encontrado no servidor</p>
                       <p className="text-xs text-muted-foreground">
                          Este arquivo pode ter sido enviado em uma versão anterior sem persistência. Por favor, reenvie o arquivo pela biblioteca.
                       </p>
                    </div>
                 )}

                 {!urlLoading && !fileNotFound && previewFile?.category === 'video' && (
                    <div className="relative w-full h-full flex items-center justify-center">
                       <video
                         ref={videoRef}
                         src={resolvedUrl || getFixedUrl(previewFile.fileUrl)}
                         controls
                         className="max-h-full max-w-full z-10 rounded-xl"
                         autoPlay
                       />
                       {/* FULLSCREEN: ambiente WebView/mobile sem botão nativo no player */}
                       {typeof document !== "undefined" && document.fullscreenEnabled && (
                          <button
                            type="button"
                            onClick={() => {
                               const el = videoRef.current as any;
                               (el?.requestFullscreen?.() ?? el?.webkitEnterFullscreen?.() ?? el?.webkitRequestFullscreen?.())?.catch?.(() => {});
                            }}
                            className="absolute top-3 right-3 z-20 w-10 h-10 rounded-xl bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all active:scale-95"
                            title="Tela cheia"
                          >
                             <Maximize2 size={16} />
                          </button>
                       )}
                    </div>
                 )}
                 {!urlLoading && !fileNotFound && previewFile?.category === 'audio' && (
                    <div className="flex flex-col items-center gap-6 z-10 w-full px-12 max-w-lg">
                       <div className="w-28 h-28 rounded-[2rem] bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40">
                          <Music size={40} />
                       </div>
                       <audio 
                         src={resolvedUrl || getFixedUrl(previewFile.fileUrl)} 
                         controls 
                         className="w-full h-14"
                         autoPlay
                       />
                    </div>
                 )}
                 {!urlLoading && !fileNotFound && (previewFile?.category === 'pdf' || previewFile?.category === 'documento' || (!previewFile?.category && previewFile?.fileName?.toLowerCase().endsWith('.pdf'))) && (
                    <div className="w-full h-full relative flex flex-col">
                       <iframe 
                         src={`${resolvedUrl || getFixedUrl(previewFile.fileUrl)}#toolbar=0`} 
                         className="w-full h-full border-none z-10 bg-card rounded-b-[2rem]"
                         title={previewFile.fileName}
                       />
                    </div>
                 )}
                 {!urlLoading && !fileNotFound && previewFile?.category === 'imagem' && (
                    <div className="relative w-full h-full flex items-center justify-center p-3 md:p-6 overflow-hidden">
                       <img
                         src={resolvedUrl || getFixedUrl(previewFile.fileUrl)}
                         alt={previewFile.fileName}
                         onDoubleClick={() => setLightboxOpen(true)}
                         className="max-h-full max-w-full object-contain z-10 shadow-2xl rounded-xl cursor-zoom-in"
                       />
                       {/* ZOOM FIX: imagens pequenas abrem em lightbox com zoom/pinça */}
                       <button
                         type="button"
                         onClick={() => setLightboxOpen(true)}
                         className="absolute bottom-3 right-3 z-20 flex items-center gap-2 h-10 px-4 rounded-xl bg-black/60 hover:bg-black/80 text-white text-[10px] font-black uppercase tracking-widest backdrop-blur-md border border-white/20 transition-all active:scale-95"
                         title="Ampliar imagem"
                       >
                          <Maximize2 size={14} /> Ampliar
                       </button>
                    </div>
                 )}
              </div>
            </DialogContent>
         </Dialog>

         {/* ZOOM FIX: lightbox fullscreen com zoom/pan/pinça para imagens da biblioteca */}
         <MediaLightbox
            open={lightboxOpen}
            src={resolvedUrl || getFixedUrl(previewFile?.fileUrl)}
            alt={previewFile?.fileName}
            onClose={() => setLightboxOpen(false)}
         />
     </div>
   );
}

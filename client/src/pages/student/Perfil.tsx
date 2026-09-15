import { trpc } from "@/lib/trpc";
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Music, 
  Trophy,
  GraduationCap,
  Clock,
  Settings,
  ShieldCheck,
  Star,
  MapPin,
  Camera,
  LogOut,
  Info,
  ChevronRight,
  Medal
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { EditProfileModal } from "@/components/EditProfileModal";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

export default function StudentProfile() {
  const { data: profile, isLoading } = trpc.studentPortal.getProfile.useQuery();
  const utils = trpc.useUtils();
  const { logout } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const updateAvatarMutation = trpc.studentPortal.updateMyAvatar.useMutation({
    onSuccess: () => {
      toast.success("Foto de perfil atualizada!");
      utils.studentPortal.getProfile.invalidate();
    },
    onError: (e) => toast.error("Erro ao salvar foto: " + e.message),
  });

  const handleAvatarFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 8MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 512;
          const scale = Math.min(1, size / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) { toast.error("Falha ao processar a imagem."); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setAvatarUrl(dataUrl);
          updateAvatarMutation.mutate({ avatar: dataUrl });
        } catch {
          toast.error("Falha ao processar a imagem.");
        }
      };
      img.onerror = () => toast.error("Falha ao ler a imagem.");
      img.src = reader.result as string;
    };
    reader.onerror = () => toast.error("Falha ao ler o arquivo.");
    reader.readAsDataURL(file);
  };

  const { data: badges = [] } = trpc.rankings.myBadges.useQuery();
  const { data: myRankings = [] } = trpc.rankings.myRankings.useQuery();
  const rankingStats = {
    vitorias: (myRankings as any[]).filter((r) => (r.finalPosition ?? r.position) === 1).length,
    podios: (myRankings as any[]).filter((r) => (r.finalPosition ?? r.position) != null && (r.finalPosition ?? r.position) <= 3).length,
    participacoes: (myRankings as any[]).length,
  };
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const initials = profile?.name
    ? profile.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "AL";

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground font-medium">Gerencie suas informações e acompanhe sua jornada musical.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-2 bg-card border border-border rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-muted transition-all shadow-sm"
          >
            <Settings size={16} className="text-primary" /> Editar Perfil
          </button>
          <button 
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-2 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </div>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
      >
        {/* Profile Info Column */}
        <motion.div variants={item} className="space-y-8">
          <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-xl overflow-hidden relative">
            <div className="h-32 bg-gradient-to-br from-primary to-indigo-600 relative overflow-hidden">
               <div className="absolute inset-0 opacity-20 flex items-center justify-center rotate-12 scale-150">
                  <Music size={120} strokeWidth={1} />
               </div>
            </div>
            <CardContent className="px-8 pb-8 -mt-16 text-center relative z-10">
              <div className="relative inline-block group">
                <Avatar className="w-32 h-32 mx-auto border-4 border-card shadow-2xl mb-4 group-hover:scale-105 transition-transform duration-300">
                  <AvatarImage src={avatarUrl ?? (profile as any)?.avatar ?? ""} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-violet-600 text-white text-3xl font-black">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => { handleAvatarFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
                />
                <button
                  type="button"
                  title="Alterar foto de perfil"
                  disabled={updateAvatarMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-6 right-2 w-8 h-8 rounded-full bg-primary text-white border-2 border-card flex items-center justify-center shadow-lg opacity-100 group-hover:scale-110 transition-transform disabled:opacity-50"
                >
                  {updateAvatarMutation.isPending ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Camera size={14} />
                  )}
                </button>
              </div>
              
              <h2 className="text-2xl font-black text-foreground">{profile?.name}</h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                 <span className="text-[10px] font-black text-primary uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                   {profile?.level}
                 </span>
                 <span className="text-[10px] font-black text-green-500 uppercase tracking-widest px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20 flex items-center gap-1.5">
                   <ShieldCheck size={10} /> Ativo
                 </span>
              </div>
              
              <div className="mt-8 pt-8 border-t border-border space-y-5">
                 <div className="flex items-center gap-4 text-sm font-bold text-muted-foreground group">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all">
                      <Mail size={16} />
                    </div>
                    <span className="truncate">{profile?.email || 'Não informado'}</span>
                 </div>
                 <div className="flex items-center gap-4 text-sm font-bold text-muted-foreground group">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all">
                      <Phone size={16} />
                    </div>
                    <span>{profile?.phone || 'Não informado'}</span>
                 </div>
                 <div className="flex items-center gap-4 text-sm font-bold text-muted-foreground group">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all">
                      <MapPin size={16} />
                    </div>
                    <span className="truncate">{profile?.address || 'Endereço não cadastrado'}</span>
                 </div>
                 <div className="flex items-center gap-4 text-sm font-bold text-muted-foreground group">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all">
                      <Calendar size={16} />
                    </div>
                    <span className="truncate">Aluno desde {profile?.startDate ? format(new Date(profile.startDate), "MMMM / yyyy", { locale: ptBR }) : 'N/A'}</span>
                 </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Detailed Info & Achievements Column */}
        <motion.div variants={item} className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm group hover:scale-[1.02] transition-transform">
              <CardContent className="p-6">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 shadow-inner">
                      <Music size={28} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Instrumento Principal</p>
                      <p className="text-xl font-black text-foreground">{(profile as any)?.instrumentName || "Não definido"}</p>
                   </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm group hover:scale-[1.02] transition-transform">
              <CardContent className="p-6">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600 shadow-inner">
                      <GraduationCap size={28} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mentor / Professor</p>
                      <p className="text-xl font-black text-foreground">{profile?.teacherName}</p>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm">
            <CardContent className="p-8">
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black flex items-center gap-3">
                    <Trophy size={20} className="text-primary" />
                    Conquistas e Progresso
                  </h3>
                  <div className="flex items-center gap-2">
                     <Star size={16} className="text-yellow-500 fill-yellow-500" />
                     <span className="text-sm font-black text-foreground">Nível Bronze</span>
                  </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                  <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Frequência das Aulas</span>
                        <span className="text-sm font-black text-green-600">95%</span>
                     </div>
                     <div className="h-3 w-full bg-muted rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-green-500 w-[95%] shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
                     </div>
                  </div>
                  <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teoria e Prática</span>
                        <span className="text-sm font-black text-blue-600">82%</span>
                     </div>
                     <div className="h-3 w-full bg-muted rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-blue-500 w-[82%] shadow-[0_0_10px_rgba(59,130,246,0.4)]" />
                     </div>
                  </div>
               </div>

               <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6">
                  {[
                     { icon: Trophy, label: "Técnica", value: profile?.level || "Iniciante" },
                     { icon: Clock, label: "Prática Total", value: "---" },
                     { icon: Music, label: "Repertório", value: "---" },
                     { icon: Trophy, label: "Nível Atual", value: profile?.level || "Iniciante" },
                  ].map((item, i) => (
                     <div key={i} className="text-center p-6 rounded-3xl bg-muted/30 border border-border group hover:border-primary/40 hover:bg-card transition-all cursor-default">
                        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 group-hover:rotate-6 transition-transform">
                           <item.icon size={20} className="text-primary" />
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">{item.label}</p>
                        <p className="text-sm font-black text-foreground uppercase">{item.value}</p>
                     </div>
                  ))}
               </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Card className="border-none shadow-xl bg-primary/5 border-l-4 border-l-primary">
                <CardContent className="p-6 flex items-start gap-4">
                   <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mt-1">
                      <Star size={20} />
                   </div>
                   <div className="space-y-1">
                      <p className="text-xs font-black text-primary uppercase tracking-widest">Próxima Meta</p>
                      <p className="text-sm font-bold text-foreground">{profile?.nextGoal || "Defina sua meta com o professor"}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">{profile?.nextGoal ? "Foco no progresso contínuo" : "Nenhuma meta pendente"}</p>
                   </div>
                </CardContent>
             </Card>
             <Card className="border-none shadow-xl bg-secondary/20">
                <CardContent className="p-6 flex items-start gap-4">
                   <div className="w-10 h-10 rounded-full bg-secondary text-muted-foreground flex items-center justify-center mt-1">
                      <Info size={20} />
                   </div>
                   <div className="space-y-1">
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Suporte ao Aluno</p>
                      <p className="text-sm font-bold text-foreground">Ajuda com o portal?</p>
                      <button 
                        onClick={() => {
                          if ((profile as any)?.schoolPhone) {
                            const numericPhone = (profile as any).schoolPhone.replace(/\D/g, '');
                            window.open(`https://wa.me/55${numericPhone}?text=Olá, preciso de ajuda com o portal do aluno.`, '_blank');
                          } else {
                            window.alert("O número de suporte ainda não foi configurado pela escola.");
                          }
                        }}
                        className="text-[10px] text-primary font-black uppercase tracking-widest hover:underline mt-1 flex items-center gap-1"
                      >
                        Abrir chamado <ChevronRight size={10} />
                      </button>
                   </div>
                </CardContent>
             </Card>
          </div>
        </motion.div>
      </motion.div>

      {/* 🏆 CONQUISTAS & MEDALHAS (PRD_SISTEMA_RANKINGS §25/§27) */}
      <Card className="border-none shadow-xl bg-card/60 backdrop-blur-xl">
        <CardContent className="p-6 md:p-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
            <h2 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2">
              <Trophy size={18} className="text-amber-500" /> Conquistas &amp; Medalhas
            </h2>
            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>🏆 {rankingStats.vitorias} vitória{rankingStats.vitorias === 1 ? "" : "s"}</span>
              <span>🥇 {rankingStats.podios} pódio{rankingStats.podios === 1 ? "" : "s"}</span>
              <span>🎯 {rankingStats.participacoes} ranking{rankingStats.participacoes === 1 ? "" : "s"}</span>
            </div>
          </div>

          {badges.length === 0 ? (
            <div className="text-center py-8">
              <Medal className="mx-auto text-muted-foreground/20 mb-3" size={36} />
              <p className="text-sm font-bold text-muted-foreground">
                Nenhuma medalha ainda — participe dos rankings e complete seus treinos para conquistar!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {badges.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 hover:-translate-y-0.5 hover:shadow-md transition-all">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg shrink-0">
                    {b.title?.charAt(0) === "🏆" ? "🏆" : b.title?.charAt(0) === "🥈" ? "🥈" : b.title?.charAt(0) === "🥉" ? "🥉" : b.title?.charAt(0) === "🔥" ? "🔥" : b.title?.charAt(0) === "💯" ? "💯" : b.title?.charAt(0) === "🚀" ? "🚀" : "🏅"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground truncate">{b.title}</p>
                    <p className="text-[10px] font-medium text-muted-foreground truncate">{b.description || "Conquista desbloqueada"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {profile && (
        <EditProfileModal 
          open={isEditModalOpen} 
          onOpenChange={setIsEditModalOpen}
          initialData={{
            phone: profile.phone || "",
            email: profile.email || "",
          }}
        />
      )}
    </div>
  );
}

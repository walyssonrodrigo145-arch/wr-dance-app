import { trpc } from "@/lib/trpc";
import { 
  Bell, 
  Search, 
  Calendar, 
  Clock, 
  User,
  ChevronRight,
  Info,
  AlertTriangle,
  Megaphone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function StudentAnnouncements() {
  const { data: announcements = [], isLoading: isLoadingAnnouncements } = trpc.studentPortal.getAnnouncements.useQuery();
  const { data: profile } = trpc.studentPortal.getProfile.useQuery();
  const [search, setSearch] = useState("");

  if (isLoadingAnnouncements) return <div>Carregando avisos...</div>;

  const filteredAnnouncements = announcements.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase()) || 
    (a.author || "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Avisos e Comunicados</h1>
          <p className="text-muted-foreground font-medium">Fique por dentro de tudo o que acontece na escola.</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <input 
          type="text" 
          placeholder="Buscar comunicados..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-2xl py-3 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredAnnouncements.map((aviso: any, idx: number) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            key={aviso.id}
          >
            <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm group hover:shadow-xl transition-all overflow-hidden border-l-4 border-l-primary">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 shadow-sm",
                    aviso.important ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {aviso.important ? <Megaphone size={20} /> : <Bell size={20} />}
                  </div>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-black text-foreground group-hover:text-primary transition-colors">
                          {aviso.title}
                        </h3>
                        {aviso.important && (
                          <span className="text-[10px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full animate-pulse">
                            Importante
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">{aviso.date}</span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                      Este é um aviso enviado para todos os alunos da modalidade de {profile?.teacherName}. 
                      Por favor, atente-se às datas e horários mencionados.
                    </p>
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <User size={12} className="text-primary" />
                        {aviso.author}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <Calendar size={12} className="text-primary" />
                        {aviso.date === 'Hoje' ? format(new Date(), "dd/MM/yyyy") : aviso.date}
                      </div>
                    </div>
                  </div>
                  
                  <div className="w-full sm:w-auto flex items-center justify-end">
                    <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:opacity-80 px-4 py-2 rounded-xl border border-primary/20 bg-primary/5 transition-all">
                      Marcar como lido
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {filteredAnnouncements.length === 0 && (
          <div className="text-center py-20 bg-muted/50 rounded-3xl border-2 border-dashed border-border">
            <Bell className="mx-auto text-muted-foreground mb-4 opacity-20" size={40} />
            <p className="text-muted-foreground font-bold">Nenhum comunicado encontrado.</p>
          </div>
        )}
      </div>

      {/* Security Tip */}
      <Card className="border-none shadow-md bg-secondary/30 rounded-2xl overflow-hidden mt-10">
        <CardContent className="p-4 flex items-center gap-3">
          <Info size={14} className="text-primary" />
          <p className="text-[11px] font-medium text-muted-foreground">
            Dica: Mantenha suas notificações ativadas para não perder avisos importantes do seu professor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

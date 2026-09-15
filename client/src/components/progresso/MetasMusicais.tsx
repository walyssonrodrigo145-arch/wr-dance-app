import { useState } from "react";
import {
  Plus,
  Loader2,
  Target,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MetasMusicais({ studentId, goals, createGoalMutation, updateGoalMutation, deleteGoalMutation }: any) {
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
         <div>
            <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">Metas Musicais</h3>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-1">Acompanhamento de Objetivos</p>
         </div>
      </div>
      <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-sm space-y-6">
        <div className="flex gap-4">
          <Input 
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Aprender o solo de Hotel California"
            className="flex-1 rounded-2xl h-12 bg-muted/50 border-border text-xs font-bold px-4"
          />
          <Button 
            onClick={() => {
              if(!title) return;
              createGoalMutation.mutate({ studentId, title });
              setTitle("");
            }}
            disabled={createGoalMutation.isPending}
            className="h-12 rounded-2xl px-6 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/10"
          >
            {createGoalMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          </Button>
        </div>
        <div className="space-y-3">
          {goals.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-border rounded-3xl">
               <Target size={32} className="mx-auto text-slate-200 mb-3" />
               <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhuma meta cadastrada</p>
            </div>
          ) : goals.map((meta: any) => (
            <div key={meta.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-muted/50 group">
               <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer",
                    meta.status === 'concluida' ? "bg-emerald-500/100 border-emerald-500 text-white" : "border-slate-300 bg-card hover:border-indigo-400"
                  )} onClick={() => updateGoalMutation.mutate({ id: meta.id, status: meta.status === 'concluida' ? 'pendente' : 'concluida' })}>
                     {meta.status === 'concluida' && <CheckCircle2 size={14} />}
                  </div>
                  <span className={cn("text-sm font-bold", meta.status === 'concluida' ? "text-muted-foreground line-through" : "text-slate-700")}>
                    {meta.title}
                  </span>
               </div>
               <Button 
                 variant="ghost" 
                 size="icon"
                 onClick={() => deleteGoalMutation.mutate({ id: meta.id })}
                 disabled={deleteGoalMutation.isPending}
                 className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
               >
                 <Trash2 size={16} />
               </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

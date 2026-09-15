import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookOpen, Edit2 } from "lucide-react";

export function Observacoes({ timeline }: any) {
  const notes = timeline.filter((e: any) => e.category === 'geral');
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
         <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">Observações</h3>
         <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-1">Anotações Gerais do Aluno</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {notes.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed border-border rounded-3xl bg-card">
             <BookOpen size={32} className="mx-auto text-slate-200 mb-3" />
             <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhuma anotação registrada</p>
          </div>
        ) : notes.map((note: any) => (
          <div key={note.id} className="bg-yellow-50 border border-yellow-200/50 p-6 rounded-3xl shadow-sm relative">
             <div className="absolute top-4 right-4 text-yellow-600/20">
               <Edit2 size={24} />
             </div>
             <p className="text-[10px] font-black text-yellow-600/60 uppercase tracking-widest mb-3">
               {format(new Date(note.achievedAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
             </p>
             <h4 className="text-sm font-black text-yellow-900 mb-2">{note.title}</h4>
             <p className="text-xs font-medium text-yellow-900/80 leading-relaxed whitespace-pre-wrap">{note.description}</p>
          </div>
        ))}
      </div>
</div>
   );
}

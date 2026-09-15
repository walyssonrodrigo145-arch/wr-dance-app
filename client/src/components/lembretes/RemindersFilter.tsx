import { Input } from "@/components/ui/input";
import { Filter, XCircle } from "lucide-react";
import { ReminderType, ReminderStatus, TYPE_CONFIG } from "./types";

interface Props {
  filterStudent: string;
  setFilterStudent: (s: string) => void;
  filterType: ReminderType | "todos";
  setFilterType: (s: ReminderType | "todos") => void;
  filterStatus: ReminderStatus | "todos";
  setFilterStatus: (s: ReminderStatus | "todos") => void;
}

export function RemindersFilter({
  filterStudent, setFilterStudent,
  filterType, setFilterType,
  filterStatus, setFilterStatus
}: Props) {
  
  const hasFilters = filterType !== "todos" || filterStatus !== "todos" || filterStudent !== "";

  const clearFilters = () => {
    setFilterStudent("");
    setFilterType("todos");
    setFilterStatus("todos");
  };

  return (
    <div className="sticky top-0 sm:top-4 z-30 mb-6 bg-background/95 sm:bg-transparent -mx-4 sm:mx-0 px-4 sm:px-0 py-2 sm:py-0">
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-card border border-border rounded-2xl p-3 shadow-lg shadow-black/5">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <Filter size={16} className="text-muted-foreground ml-2 hidden sm:block pointer-events-none" />
          <Input
            value={filterStudent}
            onChange={e => setFilterStudent(e.target.value)}
            placeholder="Buscar aluno..."
            className="flex-1 min-w-[200px] h-10 text-sm rounded-xl border-border bg-background focus-visible:ring-primary/50 transition-shadow"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value as ReminderType | "todos")}
            className="flex-1 sm:flex-none h-10 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-shadow cursor-pointer"
          >
            <option value="todos">Todos os Tipos</option>
            {(Object.entries(TYPE_CONFIG) as [ReminderType, typeof TYPE_CONFIG[ReminderType]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value as ReminderStatus | "todos")}
            className="flex-1 sm:flex-none h-10 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-shadow cursor-pointer"
          >
            <option value="todos">Todos os Status</option>
            <option value="pendente">Pendente</option>
            <option value="enviado">Enviado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          
          {hasFilters && (
            <button 
              onClick={clearFilters}
              title="Limpar filtros"
              className="h-10 px-3 flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

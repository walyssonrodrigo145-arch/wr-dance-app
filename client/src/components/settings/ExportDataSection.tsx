import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { downloadBase64File } from "@/utils/downloadReport";

export function ExportDataSection() {
  const [exporting, setExporting] = useState<string | null>(null);
  const { refetch } = trpc.settings.exportData.useQuery(undefined, { enabled: false });
  const generateReport = trpc.reportEngine.generate.useMutation();

  const handleExport = async (type: 'alunos' | 'aulas' | 'completo') => {
    setExporting(type);
    try {
      const { data } = await refetch();
      if (!data) { toast.error('Erro ao carregar os dados'); return; }

      const date = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      const buildStudentRows = () => {
        if ((data as any).studentsData && Array.isArray((data as any).studentsData)) {
          return (data as any).studentsData;
        }
        const lines = (data.studentsCsv || '').split('\n').slice(1);
        return lines
          .filter(l => l.trim())
          .map(line => {
            const p = line.split(',');
            return [
              p[0] ?? '',
              (p[1] ?? '').replace(/"/g, ''),
              (p[2] ?? '').replace(/"/g, ''),
              (p[3] ?? '').replace(/"/g, ''),
              p[4] ?? '',
              p[5] ?? '',
              Number(p[6] ?? 0),
              p[7] ?? '',
            ] as (string | number)[];
          });
      };

      const buildAulaRows = () => {
        if ((data as any).lessonsData && Array.isArray((data as any).lessonsData)) {
          return (data as any).lessonsData;
        }
        const lines = (data.lessonsCsv || '').split('\n').slice(1);
        return lines
          .filter(l => l.trim())
          .map(line => {
            const p = line.split(',');
            return [
              p[0] ?? '',
              (p[1] ?? '').replace(/"/g, ''),
              (p[2] ?? '').replace(/"/g, ''),
              p[3] ?? '',
              p[4] ?? '',
              Number(p[5] ?? 0),
              p[6] ?? '',
            ] as (string | number)[];
          });
      };

      toast.loading('Gerando relatório Excel...', { id: 'export-report' });

      if (type === 'alunos') {
        generateReport.mutate(
          { format: 'excel', title: `Relatório de Alunos — ${date}`, columns: ['ID', 'Nome', 'Email', 'Telefone', 'Nível', 'Status', 'Mensalidade (R$)', 'Início'], rows: buildStudentRows(), period: date },
          {
            onSuccess: r => { toast.dismiss('export-report'); downloadBase64File(r.data, 'excel', `alunos_${date}`); toast.success('Relatório de alunos exportado!'); },
            onError: () => { toast.dismiss('export-report'); toast.error('Erro ao gerar relatório.'); },
            onSettled: () => setExporting(null),
          }
        );
      } else if (type === 'aulas') {
        generateReport.mutate(
          { format: 'excel', title: `Relatório de Aulas — ${date}`, columns: ['ID', 'Título', 'Aluno', 'Status', 'Data', 'Duração (min)', 'Avaliação'], rows: buildAulaRows(), period: date },
          {
            onSuccess: r => { toast.dismiss('export-report'); downloadBase64File(r.data, 'excel', `aulas_${date}`); toast.success('Relatório de aulas exportado!'); },
            onError: () => { toast.dismiss('export-report'); toast.error('Erro ao gerar relatório.'); },
            onSettled: () => setExporting(null),
          }
        );
      } else {
        // Exportar tudo: dispara alunos e aulas em sequência
        generateReport.mutate(
          { format: 'excel', title: `Relatório de Alunos — ${date}`, columns: ['ID', 'Nome', 'Email', 'Telefone', 'Nível', 'Status', 'Mensalidade (R$)', 'Início'], rows: buildStudentRows(), period: date },
          {
            onSuccess: r => {
              downloadBase64File(r.data, 'excel', `alunos_${date}`);
              // depois dispara aulas
              generateReport.mutate(
                { format: 'excel', title: `Relatório de Aulas — ${date}`, columns: ['ID', 'Título', 'Aluno', 'Status', 'Data', 'Duração (min)', 'Avaliação'], rows: buildAulaRows(), period: date },
                {
                  onSuccess: r2 => { toast.dismiss('export-report'); downloadBase64File(r2.data, 'excel', `aulas_${date}`); toast.success('Todos os relatórios exportados!'); },
                  onError: () => { toast.dismiss('export-report'); toast.error('Erro ao gerar relatório de aulas.'); },
                  onSettled: () => setExporting(null),
                }
              );
            },
            onError: () => { toast.dismiss('export-report'); toast.error('Erro ao gerar relatório.'); setExporting(null); },
          }
        );
      }
    } catch {
      toast.dismiss('export-report');
      toast.error('Erro ao exportar dados');
      setExporting(null);
    }
  };

  const isLoading = !!exporting;

  return (
    <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3">
      <div>
        <p className="text-xs font-semibold text-foreground mb-1">Exportar dados</p>
        <p className="text-[10px] text-muted-foreground">Baixe relatórios organizados em Excel (compatível com Excel/Google Sheets).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="text-xs rounded-xl gap-2" disabled={isLoading}
          onClick={() => handleExport('alunos')}>
          {exporting === 'alunos' ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
          Exportar Alunos
        </Button>
        <Button variant="outline" size="sm" className="text-xs rounded-xl gap-2" disabled={isLoading}
          onClick={() => handleExport('aulas')}>
          {exporting === 'aulas' ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
          Exportar Aulas
        </Button>
        <Button size="sm" className="text-xs rounded-xl gap-2" disabled={isLoading}
          onClick={() => handleExport('completo')}>
          {exporting === 'completo' ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
          Exportar Tudo
        </Button>
      </div>
    </div>
  );
}
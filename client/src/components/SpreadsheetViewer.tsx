import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, Table as TableIcon, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from "lucide-react";

interface SpreadsheetData {
  title: string;
  columns: string[];
  data: Record<string, any>[];
  chart?: {
    type: "bar" | "line" | "pie";
    xAxisKey: string;
    series: { dataKey: string; color: string }[];
  };
}

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#00C49F", "#FFBB28", "#FF8042", "#0088FE"];

export function SpreadsheetViewer({ jsonRaw }: { jsonRaw: string }) {
  let spreadsheet: SpreadsheetData | null = null;
  try {
    spreadsheet = JSON.parse(jsonRaw);
  } catch (e) {
    return <div className="text-red-500">Erro ao carregar planilha.</div>;
  }

  if (!spreadsheet) return null;

  const handleDownloadCsv = () => {
    if (!spreadsheet) return;
    const header = spreadsheet.columns.join(",");
    const rows = spreadsheet.data.map(row => 
      spreadsheet!.columns.map(col => `"${String(row[col] || '').replace(/"/g, '""')}"`).join(",")
    );
    const csvContent = [header, ...rows].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${spreadsheet.title || "planilha"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-4 border rounded-xl overflow-hidden bg-card shadow-sm flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <TableIcon size={20} className="text-indigo-500" />
          {spreadsheet.title || "Planilha Gerada"}
        </h3>
        <button
          onClick={handleDownloadCsv}
          className="flex items-center gap-2 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg font-semibold transition-colors"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {spreadsheet.chart && spreadsheet.data.length > 0 && (
        <div className="h-[300px] w-full mt-2 bg-muted/30 rounded-xl p-4 border border-border/50">
          <ResponsiveContainer width="100%" height="100%">
            {spreadsheet.chart.type === "bar" ? (
              <BarChart data={spreadsheet.data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey={spreadsheet.chart.xAxisKey} tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                {spreadsheet.chart.series.map((s, i) => (
                  <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color || COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            ) : spreadsheet.chart.type === "line" ? (
              <LineChart data={spreadsheet.data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey={spreadsheet.chart.xAxisKey} tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                {spreadsheet.chart.series.map((s, i) => (
                  <Line type="monotone" key={s.dataKey} dataKey={s.dataKey} stroke={s.color || COLORS[i % COLORS.length]} strokeWidth={3} />
                ))}
              </LineChart>
            ) : (
              <PieChart>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Pie 
                  data={spreadsheet.data} 
                  dataKey={spreadsheet.chart.series[0]?.dataKey || "value"} 
                  nameKey={spreadsheet.chart.xAxisKey} 
                  cx="50%" 
                  cy="50%" 
                  outerRadius={100}
                >
                  {spreadsheet.data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {spreadsheet.columns.map((col, i) => (
                <TableHead key={i} className="font-bold text-foreground whitespace-nowrap">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {spreadsheet.data.map((row, i) => (
              <TableRow key={i}>
                {spreadsheet!.columns.map((col, j) => (
                  <TableCell key={j} className="whitespace-nowrap">{row[col]}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

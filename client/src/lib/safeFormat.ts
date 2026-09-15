import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function safeFormat(date: Date | string | number | null | undefined, formatStr: string, options?: any) {
  if (!date) return 'Data Inválida';
  const d = new Date(date);
  if (!isValid(d)) return 'Data Inválida';
  return format(d, formatStr, { locale: ptBR, ...options });
}

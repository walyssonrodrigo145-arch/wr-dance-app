import { motion } from "framer-motion";
import { UserCheck, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

type PortalAccessForm = {
  email?: string;
  temporaryPassword?: string;
};

type PortalAccessCardProps = {
  form: PortalAccessForm;
  handleInputChange: (field: string | React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, value?: string) => void;
  cardVariants: any;
};

export function PortalAccessCard({ form, handleInputChange, cardVariants }: PortalAccessCardProps) {
  return (
    <motion.div variants={cardVariants} className="bg-card rounded-[2rem] p-8 shadow-sm border border-emerald-500/20 bg-emerald-500/5 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-500 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-110 transition-transform duration-700 blur-3xl opacity-50" />
      
      <div className="flex items-center gap-4 mb-8 relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/10 group-hover:scale-110 transition-transform">
          <UserCheck size={24} />
        </div>
        <div>
          <h3 className="text-lg font-black text-foreground tracking-tight">Portal do Aluno</h3>
          <p className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-[0.2em]">Acesso ao portal</p>
        </div>
      </div>

      <div className="space-y-6 relative z-10">
        <div className="space-y-2">
          {form.email?.toLowerCase().endsWith('@gmail.com') ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-sm font-bold text-emerald-700">Acesso via Google Detectado</p>
              <p className="text-xs text-emerald-600 mt-1">Como o e-mail cadastrado é um @gmail.com, o aluno poderá fazer login diretamente clicando em "Entrar com Google". Nenhuma senha temporária é necessária.</p>
            </div>
          ) : (
            <>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">
                Senha Temporária (mín. 6 caracteres)
              </label>
              <div className="relative group/input">
                <Input 
                  placeholder="Defina uma senha inicial" 
                  type="password"
                  value={form.temporaryPassword}
                  onChange={(e) => handleInputChange('temporaryPassword', e.target.value)}
                  className="h-12 rounded-xl border-border bg-muted/30 focus:bg-background focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-sm font-semibold pl-11"
                />
                <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/70 group-focus-within/input:text-emerald-500 transition-colors" size={18} />
              </div>
              <p className="text-[10px] text-muted-foreground/70 font-medium px-1">
                O aluno usará o e-mail cadastrado e esta senha para o primeiro acesso.
              </p>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

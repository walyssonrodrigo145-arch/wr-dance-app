import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: {
    phone?: string;
    email?: string;
  };
}

export function EditProfileModal({ open, onOpenChange, initialData }: EditProfileModalProps) {
  const [phone, setPhone] = useState(initialData.phone || "");
  const [email, setEmail] = useState(initialData.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const utils = trpc.useUtils();
  const updateMutation = trpc.studentPortal.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso!");
      utils.studentPortal.getProfile.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar perfil");
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password && password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    updateMutation.mutate({
      phone,
      email,
      password: password || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[32px] border-none shadow-2xl bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Editar Perfil</DialogTitle>
          <DialogDescription className="font-medium">
            Altere suas informações de contato e senha.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-muted-foreground">E-mail</Label>
            <Input 
              id="email" 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border-border bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Telefone</Label>
            <Input 
              id="phone" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl border-border bg-background/50"
            />
          </div>

          <hr className="border-border/50" />

          <div className="space-y-2">
            <Label htmlFor="pass" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nova Senha</Label>
            <Input 
              id="pass" 
              type="password" 
              placeholder="Deixe em branco para não alterar"
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border-border bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Confirmar Senha</Label>
            <Input 
              id="confirm" 
              type="password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-xl border-border bg-background/50"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button 
              type="submit" 
              disabled={updateMutation.isPending}
              className="w-full bg-primary text-primary-foreground font-black uppercase tracking-widest py-6 rounded-2xl shadow-xl shadow-primary/20"
            >
              {updateMutation.isPending ? <Loader2 className="animate-spin" /> : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

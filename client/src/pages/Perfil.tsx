import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Lock, Save, User as UserIcon, Phone, Mail, KeyRound } from "lucide-react";

/**
 * Onda 3.1 — Meu Perfil (professor/admin): foto, dados de contato/apresentação
 * e troca de senha com confirmação da senha atual.
 */
export default function Perfil() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.settings.getMyProfile.useQuery();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: "", email: "", phone: "", bio: "", pixKey: "" });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || "",
      email: profile.email || "",
      phone: (profile as any).phone || "",
      bio: (profile as any).bio || "",
      pixKey: (profile as any).pixKey || "",
    });
  }, [profile]);

  const saveMutation = trpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado!");
      utils.settings.getMyProfile.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Não foi possível salvar o perfil."),
  });

  const uploadMutation = trpc.musicLibrary.upload.useMutation();
  const avatarMutation = trpc.settings.updateMyAvatar.useMutation({
    onSuccess: () => {
      toast.success("Foto atualizada!");
      utils.settings.getMyProfile.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Não foi possível salvar a foto."),
  });

  const passwordMutation = trpc.auth.updateMyPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setPwd({ current: "", next: "", confirm: "" });
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Não foi possível alterar a senha."),
  });

  const handleAvatar = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Envie uma imagem (PNG/JPG)."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 2 MB)."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      try {
        const res = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type || "image/png",
          base64Data,
        });
        const url = (res as any)?.url;
        if (!url) throw new Error("O upload não retornou a URL da imagem.");
        await avatarMutation.mutateAsync({ avatar: url });
      } catch (e: any) {
        toast.error(e?.message || "Falha ao enviar a foto.");
      }
    };
    reader.onerror = () => toast.error("Falha ao ler a imagem.");
    reader.readAsDataURL(file);
  };

  const saveProfile = () => {
    if (form.name.trim().length < 2) { toast.error("Informe seu nome."); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("E-mail inválido."); return; }
    saveMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim(),
      bio: form.bio.trim(),
      pixKey: form.pixKey.trim(),
    });
  };

  const changePassword = () => {
    if (pwd.next.length < 6) { toast.error("A nova senha precisa de ao menos 6 caracteres."); return; }
    if (pwd.next !== pwd.confirm) { toast.error("A confirmação não confere com a nova senha."); return; }
    passwordMutation.mutate({ password: pwd.next, currentPassword: pwd.current });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="animate-spin" size={18} /> Carregando seu perfil...
      </div>
    );
  }

  const initials = (form.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <UserIcon size={20} />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground tracking-tight">Meu Perfil</h1>
          <p className="text-xs text-muted-foreground font-medium">Seus dados, sua foto e sua senha</p>
        </div>
      </div>

      {/* Foto */}
      <div className="rounded-3xl border border-border/60 bg-card/60 p-5 flex items-center gap-5">
        <div className="relative">
          <Avatar className="w-20 h-20">
            {(profile as any)?.avatar ? <AvatarImage src={(profile as any).avatar} alt={form.name} /> : null}
            <AvatarFallback className="text-lg font-black">{initials}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
            title="Trocar foto"
          >
            {uploadMutation.isPending || avatarMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { handleAvatar(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-foreground truncate">{form.name || "Seu nome"}</p>
          <p className="text-[11px] text-muted-foreground font-medium capitalize">
            {(profile as any)?.role === "admin" ? "Administrador" : (profile as any)?.role === "professor" ? "Professor / Coreógrafo" : (profile as any)?.role}
            {(profile as any)?.especialidade ? ` • ${(profile as any).especialidade}` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">PNG/JPG até 2 MB. A foto aparece para a escola no painel.</p>
        </div>
      </div>

      {/* Dados */}
      <div className="rounded-3xl border border-border/60 bg-card/60 p-5 space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dados e contato</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><UserIcon size={11} /> Nome</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Mail size={11} /> E-mail</label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Phone size={11} /> Telefone</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" className="h-10 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><KeyRound size={11} /> Chave PIX (para receber alunos)</label>
            <Input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} className="h-10 rounded-xl text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Apresentação</label>
          <Textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={3}
            maxLength={1000}
            placeholder="Conte um pouco da sua experiência e das modalidades que você ensina."
            className="rounded-xl text-sm resize-none"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={saveProfile} disabled={saveMutation.isPending} className="h-10 rounded-xl px-5 text-xs font-bold gap-2">
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar perfil
          </Button>
        </div>
      </div>

      {/* Senha */}
      <div className="rounded-3xl border border-border/60 bg-card/60 p-5 space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Lock size={11} /> Segurança</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Senha atual</label>
            <Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} className="h-10 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nova senha</label>
            <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} className="h-10 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Confirmar nova senha</label>
            <Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} className="h-10 rounded-xl text-sm" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-muted-foreground">Mínimo de 6 caracteres. Você continua logado após a troca.</p>
          <Button
            type="button"
            variant="outline"
            onClick={changePassword}
            disabled={passwordMutation.isPending || !pwd.current || !pwd.next}
            className="h-10 rounded-xl px-5 text-xs font-bold gap-2"
          >
            {passwordMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            Alterar senha
          </Button>
        </div>
      </div>
    </div>
  );
}

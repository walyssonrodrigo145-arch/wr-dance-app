import React from 'react';
import { Sparkles, Building2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

// Carrossel de clientes estilo "logo cloud" (Coinbase/Wise/Headspace):
// apenas logo + nome, marquee infinito com fade nas bordas.
export default function ClientsMarquee() {
  const { data: dbClients = [] } = trpc.publicData.getLandingClients.useQuery();

  if (dbClients.length === 0) {
    return null;
  }

  // Duplicar array para rotação contínua perfeita no CSS/Framer
  const repeatMultiplier = Math.max(3, Math.ceil(12 / dbClients.length));
  const marqueeItems = Array(repeatMultiplier).fill(dbClients).flat();

  return (
    <section id="clients" className="relative py-24 bg-background border-b border-border/40 overflow-hidden select-none">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="container relative z-10 mb-14">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-black tracking-widest uppercase shadow-xs">
            <Sparkles size={13} className="text-primary animate-pulse" />
            <span>Escolas & Parceiros Oficiais</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-outfit font-extrabold text-foreground tracking-tight leading-[1.15]">
            Quem confia na <span className="text-primary font-black">MusicPro</span> para transformar sua escola
          </h2>

          <p className="text-sm md:text-base text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
            Grandes escolas, conservatórios e estúdios musicais utilizam nosso ecossistema todos os dias para gerenciar alunos, turmas e finanças com máxima excelência.
          </p>
        </div>
      </div>

      {/* ── MARQUEE INFINITO — LOGO + NOME, COM FADE MASK ── */}
      <div
        className="relative w-full overflow-hidden py-4"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        }}
      >
        <div className="flex w-max items-center gap-16 animate-marquee hover:[animation-play-state:paused] transition-all">
          {marqueeItems.map((item: any, index: number) => (
            <div key={`${item.id}-${index}`} className="group flex items-center gap-4 shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-card border border-border/50 p-2.5 flex items-center justify-center shrink-0 shadow-sm overflow-hidden transition-all duration-300 group-hover:border-primary/30 group-hover:scale-105">
                {item.logoUrl ? (
                  <img
                    src={item.logoUrl}
                    alt={item.name}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain transition-all duration-300"
                  />
                ) : (
                  <Building2 size={24} className="text-primary/50" />
                )}
              </div>
              <span className="text-lg md:text-xl font-bold text-foreground whitespace-nowrap">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

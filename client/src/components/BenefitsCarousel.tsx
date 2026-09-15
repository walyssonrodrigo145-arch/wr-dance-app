import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Users, CalendarDays, Activity, Bell, Video, TrendingUp, Clock, LayoutDashboard, CopyCheck, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Dados dos Slides ---
const slides = [
  {
    id: 1,
    title: 'Tenha total controle dos seus alunos',
    subtitle: 'Gestão Completa dos Alunos',
    description: 'Centralize informações, acompanhe a evolução individual e mantenha tudo organizado em um único lugar.',
    icon: Users,
    color: 'from-blue-500 to-indigo-600',
    metrics: [
      { label: 'Alunos Ativos', value: '142', trend: '+12%' },
      { label: 'Retenção', value: '98%', trend: '+5%' },
    ]
  },
  {
    id: 2,
    title: 'Crie planos de estudo em segundos',
    subtitle: 'Planos Automatizados',
    description: 'Gere planos personalizados para cada aluno e acompanhe a execução das atividades sem precisar enviar mensagens diariamente.',
    icon: CalendarDays,
    color: 'from-emerald-400 to-teal-600',
    metrics: [
      { label: 'Planos Criados', value: '380', trend: '+24%' },
      { label: 'Engajamento', value: '85%', trend: '+10%' },
    ]
  },
  {
    id: 3,
    title: 'Saiba quem está praticando',
    subtitle: 'Monitoramento de Treinos',
    description: 'Os alunos registram seus treinos e o sistema mostra quem está estudando e quem precisa de acompanhamento.',
    icon: Activity,
    color: 'from-violet-500 to-purple-600',
    metrics: [
      { label: 'Horas Praticadas', value: '1.2k', trend: 'Mês' },
      { label: 'Alunos Focados', value: '89', trend: 'Hoje' },
    ]
  },
  {
    id: 4,
    title: 'Nunca perca um aluno por falta de acompanhamento',
    subtitle: 'Alertas Inteligentes',
    description: 'Receba notificações automáticas quando um aluno parar de praticar ou ficar sem registrar atividades.',
    icon: Bell,
    color: 'from-rose-400 to-red-600',
    metrics: [
      { label: 'Evasão Evitada', value: '14', trend: 'Mês' },
      { label: 'Alertas', value: '3', trend: 'Ativos' },
    ]
  },
  {
    id: 5,
    title: 'Tire dúvidas sem interromper sua rotina',
    subtitle: 'Correção por Vídeo',
    description: 'Os alunos enviam vídeos com dúvidas e você responde de forma organizada diretamente pela plataforma.',
    icon: Video,
    color: 'from-amber-400 to-orange-600',
    metrics: [
      { label: 'Vídeos Analisados', value: '45', trend: 'Semana' },
      { label: 'Satisfação', value: '4.9', trend: 'Estrelas' },
    ]
  },
  {
    id: 6,
    title: 'Acompanhe a evolução de cada aluno',
    subtitle: 'Histórico de Evolução',
    description: 'Visualize atividades concluídas, frequência, desempenho e progresso ao longo do tempo.',
    icon: TrendingUp,
    color: 'from-sky-400 to-blue-600',
    metrics: [
      { label: 'Aulas Concluídas', value: '890', trend: 'Ano' },
      { label: 'Média Desempenho', value: '92%', trend: 'Geral' },
    ]
  },
  {
    id: 7,
    title: 'Melhor administração, mais ensino!',
    subtitle: 'Economia de Tempo',
    description: 'Automatize processos que hoje são feitos pelo WhatsApp, planilhas e anotações manuais.',
    icon: Clock,
    color: 'from-pink-500 to-rose-600',
    metrics: [
      { label: 'Horas Economizadas', value: '15h', trend: '/Semana' },
      { label: 'Processos', value: '100%', trend: 'Automáticos' },
    ]
  },
  {
    id: 8,
    title: 'Atenda mais alunos sem perder qualidade',
    subtitle: 'Escalabilidade',
    description: 'Organize dezenas ou centenas de alunos mantendo um acompanhamento profissional e personalizado.',
    icon: CopyCheck,
    color: 'from-fuchsia-500 to-pink-600',
    metrics: [
      { label: 'Capacidade', value: '300+', trend: 'Alunos' },
      { label: 'Crescimento', value: '40%', trend: 'Ao Ano' },
    ]
  },
  {
    id: 9,
    title: 'Tudo que você precisa em um único painel',
    subtitle: 'Dashboard Inteligente',
    description: 'Visualize métricas, alunos ativos, frequência, treinos realizados e pendências em tempo real.',
    icon: LayoutDashboard,
    color: 'from-indigo-500 to-blue-600',
    metrics: [
      { label: 'Métricas', value: 'Tempo Real', trend: 'Online' },
      { label: 'Gestão', value: '360º', trend: 'Completa' },
    ]
  }
];

const AUTOPLAY_INTERVAL = 6000; // 6 seconds per slide

export function BenefitsCarousel() {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  // Autoplay and progress bar logic
  useEffect(() => {
    if (isHovered) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrent((c) => (c === slides.length - 1 ? 0 : c + 1));
          return 0;
        }
        return prev + (100 / (AUTOPLAY_INTERVAL / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isHovered, current]);

  // Reset progress when manually changing slides
  const changeSlide = (index: number) => {
    setCurrent(index);
    setProgress(0);
  };

  const nextSlide = () => changeSlide(current === slides.length - 1 ? 0 : current + 1);
  const prevSlide = () => changeSlide(current === 0 ? slides.length - 1 : current - 1);

  const activeSlide = slides[current];
  const Icon = activeSlide.icon;

  return (
    <section 
      className="relative py-24 lg:py-32 bg-background overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Imagens de Fundo / Decoração de Instrumentos */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
      </div>

      <div className="container relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-primary font-black tracking-widest uppercase text-sm mb-4">A Plataforma Que Trabalha Para Você</h2>
          <h3 className="text-4xl md:text-5xl font-extrabold text-foreground mb-6 leading-tight">
            Transforme sua escola em uma <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-500">operação profissional</span>
          </h3>
          <p className="text-lg text-muted-foreground font-medium">
            Economize horas por semana com automação, acompanhe cada aluno sem depender do WhatsApp e tenha controle total sobre a evolução da sua escola.
          </p>
        </div>

        <div className="bg-card border border-border/50 rounded-[2.5rem] shadow-2xl overflow-hidden backdrop-blur-sm max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-12 min-h-[550px]">
            
            {/* Esquerda: Menu/Indicadores de Progresso */}
            <div className="lg:col-span-4 bg-muted/20 border-r border-border/50 p-6 flex flex-col justify-center gap-2 overflow-y-auto max-h-[600px] custom-scrollbar">
              {slides.map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => changeSlide(idx)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl transition-all text-left group relative overflow-hidden",
                    current === idx 
                      ? "bg-background shadow-md border border-border/50" 
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  {/* Fundo de progresso (visível apenas no slide ativo) */}
                  {current === idx && (
                    <div 
                      className={cn("absolute bottom-0 left-0 h-1 bg-gradient-to-r transition-all duration-75", slide.color)}
                      style={{ width: `${progress}%` }}
                    />
                  )}
                  
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    current === idx 
                      ? `bg-gradient-to-br ${slide.color} text-white shadow-lg` 
                      : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  )}>
                    <slide.icon size={18} />
                  </div>
                  <div>
                    <h4 className={cn(
                      "font-bold text-sm transition-colors",
                      current === idx ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}>
                      {slide.subtitle}
                    </h4>
                  </div>
                </button>
              ))}
            </div>

            {/* Direita: Conteúdo do Slide Ativo */}
            <div className="lg:col-span-8 p-8 lg:p-16 flex flex-col justify-center relative overflow-hidden bg-background">
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide.id}
                  initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="relative z-10"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest mb-8">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Funcionalidade Premium
                  </div>
                  
                  <h3 className="text-3xl md:text-4xl lg:text-5xl font-black text-foreground mb-6 leading-[1.1] tracking-tight">
                    {activeSlide.title}
                  </h3>
                  
                  <p className="text-lg text-muted-foreground font-medium leading-relaxed mb-10 max-w-2xl">
                    {activeSlide.description}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-6 mb-12">
                    {activeSlide.metrics.map((metric, i) => (
                      <div key={i} className="p-6 rounded-[2rem] bg-muted/30 border border-border/50 flex flex-col gap-1 shadow-sm">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{metric.label}</span>
                        <div className="flex items-end gap-3">
                          <span className="text-3xl font-black text-foreground">{metric.value}</span>
                          <span className={cn(
                            "text-sm font-bold pb-1",
                            metric.trend.includes('+') ? "text-emerald-500" : "text-primary"
                          )}>
                            {metric.trend}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors group"
                  >
                    Ver Planos e Preços
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </button>

                </motion.div>
              </AnimatePresence>

              {/* Decoração de Fundo Animada do Conteúdo */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-full blur-3xl translate-y-1/2 translate-x-1/4 pointer-events-none" />

              {/* Controles Manuais */}
              <div className="absolute bottom-8 right-8 flex items-center gap-3 z-20">
                <button 
                  onClick={prevSlide}
                  className="w-12 h-12 rounded-full bg-muted/50 hover:bg-muted border border-border/50 flex items-center justify-center text-foreground transition-all active:scale-95 backdrop-blur-sm"
                >
                  <ChevronLeft size={20} />
                </button>
                <button 
                  onClick={nextSlide}
                  className="w-12 h-12 rounded-full bg-muted/50 hover:bg-muted border border-border/50 flex items-center justify-center text-foreground transition-all active:scale-95 backdrop-blur-sm"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Citações / Mensagens de Impacto */}
        <div className="flex flex-wrap justify-center gap-4 mt-12">
          {["Mais organização", "Mais retenção", "Mais crescimento"].map((tag, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              viewport={{ once: true }}
              className="px-6 py-3 rounded-full bg-card border border-border/50 text-sm font-bold text-muted-foreground flex items-center gap-2 shadow-sm"
            >
              <Check size={16} className="text-emerald-500" strokeWidth={3} />
              {tag}
            </motion.div>
          ))}
        </div>

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.3);
          border-radius: 10px;
        }
      `}} />
    </section>
  );
}

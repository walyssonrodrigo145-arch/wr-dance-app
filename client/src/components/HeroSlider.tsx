import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getSlideTheme } from '@/lib/slideThemes';

const DEFAULT_SLIDES = [
  {
    id: 1,
    title: 'Gestão de Alunos',
    highlight: 'Automática',
    subtitle: 'O MusicPro automatiza a maioria das tarefas chatas e manuais que você e sua equipe fazem hoje.',
    points: [
      'Registro de presença rápido e fácil.',
      'Acompanhamento de evolução do aluno.',
      'Controle de turmas e matrículas.'
    ],
    img: '/images/alunos-preview.png',
    bg: 'bg-slate-50',
    textColor: 'text-slate-900',
    highlightColor: 'text-blue-600',
  },
  {
    id: 2,
    title: 'Cobranças e Lembretes',
    highlight: 'pelo WhatsApp',
    subtitle: 'O sistema gera e envia as cobranças para os alunos todo mês, seja por Pix ou Cartão.',
    points: [
      'Lembra os alunos de pagar no dia do vencimento.',
      'Cobra automaticamente quem está inadimplente.',
      'Diga adeus àquela conversa chata de cobrar aluno.'
    ],
    img: '/images/lembretes-preview.png',
    bg: 'bg-blue-600',
    textColor: 'text-white',
    highlightColor: 'text-blue-200',
  },
  {
    id: 3,
    title: 'Tudo o que você precisa em um',
    highlight: 'Painel Inteligente',
    subtitle: 'Tenha controle total do seu negócio com dados precisos e fáceis de visualizar.',
    points: [
      'Gráficos de receitas e despesas.',
      'Taxa de retenção de alunos.',
      'Previsão de faturamento mensal.'
    ],
    img: '/images/dashboard-preview.png',
    bg: 'bg-slate-900',
    textColor: 'text-white',
    highlightColor: 'text-indigo-400',
  },
  {
    id: 4,
    title: 'Agenda de Aulas',
    highlight: '100% Organizada',
    subtitle: 'Evite conflitos de horário e mantenha a rotina da escola fluindo perfeitamente.',
    points: [
      'Calendário interativo para professores.',
      'Notificações de cancelamento e reposição.',
      'Visão diária, semanal ou mensal.'
    ],
    img: '/images/aulas-preview.png',
    bg: 'bg-indigo-50',
    textColor: 'text-indigo-950',
    highlightColor: 'text-indigo-600',
  }
];

const AUTOPLAY_INTERVAL = 6000;

export function HeroSlider() {
  const { data: dbSlides } = trpc.publicData.getHeroSlides.useQuery();

  const slides = React.useMemo(() => {
    // Carregando ou erro na consulta: mantém o visual com os slides padrão
    if (dbSlides === undefined) return DEFAULT_SLIDES;
    // Admin removeu/desativou todos os slides: respeita a decisão (sem slider)
    if (dbSlides.length === 0) return null;
    return dbSlides.map((s: any) => {
      let pts: string[] = [];
      try {
        pts = typeof s.points === 'string' ? JSON.parse(s.points) : s.points || [];
      } catch {
        pts = [];
      }
      const { bg, textColor, highlightColor } = getSlideTheme(s.bgTheme);
      return {
        id: s.id,
        title: s.title,
        highlight: s.highlight,
        subtitle: s.subtitle,
        points: pts,
        img: s.imageUrl,
        bg,
        textColor,
        highlightColor,
      };
    });
  }, [dbSlides]);

  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  if (!slides || slides.length === 0) return null;

  // Garantir índice válido se a lista mudar
  useEffect(() => {
    if (current >= slides.length) {
      setCurrent(0);
    }
  }, [slides.length, current]);

  useEffect(() => {
    if (isHovered || slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((c) => (c === slides.length - 1 ? 0 : c + 1));
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [isHovered, slides.length]);

  const nextSlide = () => setCurrent(current === slides.length - 1 ? 0 : current + 1);
  const prevSlide = () => setCurrent(current === 0 ? slides.length - 1 : current - 1);

  const slide = slides[current] || slides[0] || DEFAULT_SLIDES[0];

  return (
    <div 
      className={`relative w-full max-w-7xl mx-auto rounded-[32px] overflow-hidden shadow-2xl transition-colors duration-700 ease-in-out ${slide.bg}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute inset-0 bg-grid-slate-900/[0.04] bg-[size:20px_20px]" />
      
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative grid lg:grid-cols-2 gap-10 min-h-[500px] p-10 md:p-16 items-center"
        >
          {/* TEXT CONTENT */}
          <div className={`space-y-6 z-10 ${slide.textColor}`}>
            <motion.h2 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl font-black leading-tight tracking-tight"
            >
              {slide.title} <br className="hidden md:block" />
              <span className={slide.highlightColor}>{slide.highlight}</span>
            </motion.h2>

            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`text-lg md:text-xl font-medium opacity-90 leading-relaxed max-w-lg`}
            >
              {slide.subtitle}
            </motion.p>

            <motion.ul 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="space-y-3 pt-4"
            >
              {slide.points.map((pt, i) => (
                <li key={i} className="flex items-start gap-3 font-semibold opacity-90 text-sm md:text-base">
                  <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
                  <span>{pt}</span>
                </li>
              ))}
            </motion.ul>
          </div>

          {/* IMAGE / MOCKUP CONTENT */}
          <motion.div 
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
            className="relative z-10 flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-lg perspective-1000">
              {/* Decorative Blur */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-white/5 rounded-3xl blur-2xl transform scale-110 -z-10" />
              
              <img 
                src={slide.img} 
                alt={slide.title} 
                className="w-full h-auto object-cover rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] border border-white/20 transform hover:-translate-y-2 hover:rotate-1 transition-transform duration-500"
              />
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* NAVIGATION CONTROLS */}
      <button 
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-black/10 hover:bg-black/20 text-current rounded-full backdrop-blur-md transition-all z-20"
      >
        <ChevronLeft size={28} />
      </button>
      
      <button 
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-black/10 hover:bg-black/20 text-current rounded-full backdrop-blur-md transition-all z-20"
      >
        <ChevronRight size={28} />
      </button>

      {/* DOTS PONTINHOS */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2.5 z-20">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`transition-all duration-300 rounded-full h-2.5 ${
              current === idx 
                ? 'w-10 bg-current opacity-90' 
                : 'w-2.5 bg-current opacity-30 hover:opacity-50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

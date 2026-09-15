// ─── TEMAS PADRONIZADOS DOS SLIDES DO HERO (fonte única) ─────────────────────
// Usado por HeroSlider (landing) e HeroSlidesManager (SuperAdmin) para garantir
// que o editor ofereça exatamente os mesmos temas que o renderizador suporta.

export interface SlideTheme {
  id: string;
  label: string;
  bg: string;             // classe Tailwind do fundo
  previewHex: string;     // cor sólida para o swatch do admin
  textColor: string;      // classe do texto principal
  highlightColor: string; // classe do texto destacado
  dark: boolean;
}

export const SLIDE_THEMES: SlideTheme[] = [
  {
    id: 'slate-50',
    label: 'Claro Minimalista',
    bg: 'bg-slate-50',
    previewHex: '#f8fafc',
    textColor: 'text-slate-900',
    highlightColor: 'text-blue-600',
    dark: false,
  },
  {
    id: 'indigo-50',
    label: 'Índigo Suave',
    bg: 'bg-indigo-50',
    previewHex: '#eef2ff',
    textColor: 'text-indigo-950',
    highlightColor: 'text-indigo-600',
    dark: false,
  },
  {
    id: 'blue-600',
    label: 'Azul MusicPro',
    bg: 'bg-blue-600',
    previewHex: '#2563eb',
    textColor: 'text-white',
    highlightColor: 'text-blue-100',
    dark: true,
  },
  {
    id: 'slate-900',
    label: 'Dark Escuro',
    bg: 'bg-slate-900',
    previewHex: '#0f172a',
    textColor: 'text-white',
    highlightColor: 'text-indigo-400',
    dark: true,
  },
  {
    id: 'emerald-950',
    label: 'Verde Profundo',
    bg: 'bg-emerald-950',
    previewHex: '#022c22',
    textColor: 'text-white',
    highlightColor: 'text-emerald-300',
    dark: true,
  },
  {
    id: 'violet-950',
    label: 'Violeta Profundo',
    bg: 'bg-violet-950',
    previewHex: '#2e1065',
    textColor: 'text-white',
    highlightColor: 'text-violet-300',
    dark: true,
  },
];

export const DEFAULT_SLIDE_THEME_ID = 'slate-900';

export function getSlideTheme(id?: string | null): SlideTheme {
  return (
    SLIDE_THEMES.find(t => t.id === id) ||
    SLIDE_THEMES.find(t => t.id === DEFAULT_SLIDE_THEME_ID)!
  );
}

import { Link } from "wouter";
import { DanceProLogo } from "@/components/DanceProLogo";
import { useSeo, SEO_SITE_URL } from "@/hooks/useSeo";
import {
  SEO_FEATURES,
  SEO_SEGMENTS,
  SEO_COMPARISONS,
  SEO_BLOG,
  SEO_GLOSSARY,
  getSeoFeature,
  getSeoSegment,
  getSeoComparison,
  getSeoBlogPost,
} from "@shared/seo";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, MessageCircle, Sparkles, BookOpen, Layers, GitCompare, BookMarked } from "lucide-react";

const WHATSAPP = "https://wa.me/5533984055949?text=Quero%20conhecer%20o%20DancePro";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 py-5">
        <div className="container flex items-center justify-between gap-3">
          <Link href="/"><DanceProLogo size="md" /></Link>
          <div className="flex items-center gap-2">
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary">
              <MessageCircle size={14} /> Falar com a gente
            </a>
            <Link href="/cadastro"><Button className="h-9 rounded-xl px-4 text-xs font-bold">Testar grátis</Button></Link>
          </div>
        </div>
      </header>

      <main className="container py-12 max-w-4xl space-y-10">{children}</main>

      <footer className="border-t border-border/50 py-10 mt-8">
        <div className="container max-w-4xl flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold text-muted-foreground">
          <Link href="/" className="hover:text-primary">Início</Link>
          <Link href="/funcionalidades" className="hover:text-primary">Funcionalidades</Link>
          <Link href="/para" className="hover:text-primary">Para sua modalidade</Link>
          <Link href="/comparar" className="hover:text-primary">Comparativos</Link>
          <Link href="/blog" className="hover:text-primary">Blog</Link>
          <Link href="/glossario" className="hover:text-primary">Glossário</Link>
          <Link href="/indique" className="hover:text-primary">Indique e Ganhe</Link>
        </div>
      </footer>
    </div>
  );
}

function CtaBox() {
  return (
    <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1">
        <p className="font-outfit font-extrabold text-foreground">Teste o DancePro por 7 dias grátis</p>
        <p className="text-xs text-muted-foreground mt-1">Sem cartão. Importe sua turma por CSV e veja a chamada funcionando hoje.</p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/cadastro"><Button className="h-10 rounded-xl px-5 text-xs font-bold gap-2">Criar conta <ArrowRight size={14} /></Button></Link>
        <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="h-10 rounded-xl px-4 text-xs font-bold">Falar com humano</Button>
        </a>
      </div>
    </div>
  );
}

function HubCard({ href, icon: Icon, title, text }: { href: string; icon: typeof Layers; title: string; text: string }) {
  return (
    <Link href={href} className="rounded-3xl border border-border/60 bg-card/60 p-5 hover:border-primary/30 hover:bg-primary/5 transition-colors block">
      <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
        <Icon size={18} />
      </div>
      <p className="font-outfit font-extrabold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{text}</p>
    </Link>
  );
}

/** Páginas públicas de SEO do DancePro (funcionalidades, segmentos, blog e glossário). */
export default function SeoSite() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";

  const feature = path.startsWith("/funcionalidades/") ? getSeoFeature(path.split("/")[2] || "") : undefined;
  const segment = path.startsWith("/para/") ? getSeoSegment(path.split("/")[2] || "") : undefined;
  const comparison = path.startsWith("/comparar/") ? getSeoComparison(path.split("/")[2] || "") : undefined;
  const post = path.startsWith("/blog/") ? getSeoBlogPost(path.split("/")[2] || "") : undefined;

  const isFeatureHub = path === "/funcionalidades";
  const isSegmentHub = path === "/para";
  const isCompareHub = path === "/comparar";
  const isBlogHub = path === "/blog";
  const isGlossary = path === "/glossario";

  if (feature) {
    useSeo({
      title: `${feature.title} | DancePro`,
      description: feature.description,
      path,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: feature.title, description: feature.description, url: `${SEO_SITE_URL}${path}` },
    });
    return (
      <Shell>
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">{feature.subtitle}</p>
          <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">{feature.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{feature.description}</p>
        </div>
        <ul className="space-y-3">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <CtaBox />
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Outras funcionalidades</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {SEO_FEATURES.filter((f) => f.slug !== feature.slug).slice(0, 4).map((f) => (
              <Link key={f.slug} href={`/funcionalidades/${f.slug}`} className="text-sm font-bold text-foreground hover:text-primary">{f.title} →</Link>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (segment) {
    useSeo({
      title: `${segment.title} | DancePro`,
      description: segment.description,
      path,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: segment.title, description: segment.description, url: `${SEO_SITE_URL}${path}` },
    });
    return (
      <Shell>
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Feito para o seu tipo de escola</p>
          <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">{segment.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{segment.description}</p>
          <p className="text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 inline-flex">
            Dor comum: {segment.painPoint}
          </p>
        </div>
        <ul className="space-y-3">
          {segment.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <CtaBox />
        <div className="flex flex-wrap gap-3">
          {SEO_SEGMENTS.filter((s) => s.slug !== segment.slug).map((s) => (
            <Link key={s.slug} href={`/para/${s.slug}`} className="text-xs font-bold text-muted-foreground hover:text-primary">{s.title.replace("Sistema para ", "")}</Link>
          ))}
        </div>
      </Shell>
    );
  }

  if (comparison) {
    useSeo({
      title: `${comparison.title} | DancePro`,
      description: comparison.intro,
      path,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: comparison.title, description: comparison.intro, url: `${SEO_SITE_URL}${path}` },
    });
    return (
      <Shell>
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Comparativo</p>
          <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">{comparison.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{comparison.intro}</p>
        </div>
        <div className="rounded-2xl border border-border/60 overflow-hidden">
          <div className="grid grid-cols-3 bg-muted/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <div className="px-3 py-2.5">Critério</div>
            <div className="px-3 py-2.5 text-primary">DancePro</div>
            <div className="px-3 py-2.5">{comparison.against}</div>
          </div>
          <div className="divide-y divide-border/40">
            {comparison.rows.map((row) => (
              <div key={row.criterion} className="grid grid-cols-3 text-xs">
                <div className="px-3 py-3 font-bold text-foreground">{row.criterion}</div>
                <div className="px-3 py-3 text-muted-foreground">{row.dancepro}</div>
                <div className="px-3 py-3 text-muted-foreground">{row.other}</div>
              </div>
            ))}
          </div>
        </div>
        <CtaBox />
      </Shell>
    );
  }

  if (post) {
    useSeo({
      title: `${post.title} | Blog DancePro`,
      description: post.excerpt,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.excerpt,
        datePublished: post.date,
        url: `${SEO_SITE_URL}${path}`,
        author: { "@type": "Organization", name: "DancePro" },
      },
    });
    return (
      <Shell>
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">
            Blog • {new Date(`${post.date}T12:00:00`).toLocaleDateString("pt-BR")} • {post.readMinutes} min de leitura
          </p>
          <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">{post.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{post.excerpt}</p>
        </div>
        <div className="space-y-7">
          {post.sections.map((s) => (
            <section key={s.heading} className="space-y-2">
              <h2 className="text-lg font-outfit font-extrabold text-foreground">{s.heading}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
        <CtaBox />
      </Shell>
    );
  }

  if (isGlossary) {
    useSeo({
      title: "Glossário de dança | DancePro",
      description: "Termos de ballet, jazz e danças urbanas explicados: barra, centro, diagonal, sapatilha, ensaio geral, figurino e mais.",
      path,
    });
    return (
      <Shell>
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-1.5"><BookMarked size={13} /> Glossário</p>
          <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">Termos da dança, sem mistério</h1>
          <p className="text-muted-foreground max-w-2xl">Do barra ao ensaio geral — o vocabulário que sua equipe e as famílias usam no dia a dia.</p>
        </div>
        <div className="rounded-2xl border border-border/60 divide-y divide-border/40">
          {SEO_GLOSSARY.map((t) => (
            <div key={t.term} className="px-4 py-3">
              <p className="text-sm font-black text-foreground">{t.term}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.definition}</p>
            </div>
          ))}
        </div>
        <CtaBox />
      </Shell>
    );
  }

  // Hubs
  const hub = isFeatureHub
    ? { title: "Funcionalidades do DancePro", subtitle: "Tudo que a escola de dança precisa", description: "Da chamada da turma ao figurino do espetáculo: conheça os módulos do DancePro." }
    : isSegmentHub
    ? { title: "DancePro para cada modalidade", subtitle: "Escolha o seu tipo de escola", description: "Ballet, jazz, urbanas, salão, sapateado, contemporâneo, infantil e ritmos — cada um com necessidades próprias." }
    : isCompareHub
    ? { title: "Compare o DancePro", subtitle: "Por que trocar", description: "Veja a diferença entre o DancePro e as alternativas mais comuns nas escolas de dança." }
    : { title: "Blog DancePro", subtitle: "Gestão para escola de dança", description: "Artigos práticos sobre rematrícula, inadimplência, espetáculo e rotina de estúdio." };

  useSeo({ title: `${hub.title} | DancePro`, description: hub.description, path });

  return (
    <Shell>
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-primary">{hub.subtitle}</p>
        <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">{hub.title}</h1>
        <p className="text-muted-foreground max-w-2xl">{hub.description}</p>
      </div>

      {isFeatureHub && (
        <div className="grid sm:grid-cols-2 gap-4">
          {SEO_FEATURES.map((f) => <HubCard key={f.slug} href={`/funcionalidades/${f.slug}`} icon={Sparkles} title={f.title} text={f.description} />)}
        </div>
      )}

      {isSegmentHub && (
        <div className="grid sm:grid-cols-2 gap-4">
          {SEO_SEGMENTS.map((s) => <HubCard key={s.slug} href={`/para/${s.slug}`} icon={Layers} title={s.title} text={s.description} />)}
        </div>
      )}

      {isCompareHub && (
        <div className="grid sm:grid-cols-2 gap-4">
          {SEO_COMPARISONS.map((c) => <HubCard key={c.slug} href={`/comparar/${c.slug}`} icon={GitCompare} title={c.title} text={c.intro} />)}
        </div>
      )}

      {isBlogHub && (
        <div className="grid sm:grid-cols-2 gap-4">
          {SEO_BLOG.map((b) => <HubCard key={b.slug} href={`/blog/${b.slug}`} icon={BookOpen} title={b.title} text={b.excerpt} />)}
        </div>
      )}

      {!isFeatureHub && !isSegmentHub && !isCompareHub && !isBlogHub && (
        <div className="grid sm:grid-cols-2 gap-4">
          <HubCard href="/funcionalidades" icon={Sparkles} title="Funcionalidades" text="Todos os módulos do DancePro explicados." />
          <HubCard href="/para" icon={Layers} title="Para sua modalidade" text="Ballet, jazz, urbanas, salão e mais." />
          <HubCard href="/comparar" icon={GitCompare} title="Comparativos" text="DancePro x planilha e sistemas genéricos." />
          <HubCard href="/blog" icon={BookOpen} title="Blog" text="Gestão prática para escola de dança." />
        </div>
      )}

      <CtaBox />
    </Shell>
  );
}

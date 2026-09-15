import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermosDeUso() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = "Termos de Uso — MusicPro";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-bold text-sm">
            <ArrowLeft size={16} />
            Voltar ao início
          </Link>
          <div className="flex items-center gap-2 text-primary font-black text-lg">
            <FileText size={20} />
            MusicPro
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border-b border-border/50 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-500 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6">
            <FileText size={14} />
            Documento Legal
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4 tracking-tight">
            Termos de Uso
          </h1>
          <p className="text-muted-foreground font-medium max-w-xl mx-auto">
            Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16 space-y-12">

        <section>
          <p className="text-muted-foreground leading-relaxed text-lg">
            Bem-vindo ao <strong className="text-foreground">MusicPro</strong>. Ao acessar ou usar nossa plataforma, você concorda com os presentes Termos de Uso. Leia-os cuidadosamente antes de utilizar o serviço. Caso não concorde, não utilize a plataforma.
          </p>
        </section>

        {[
          {
            num: "1",
            title: "Aceitação dos Termos",
            content: `Estes Termos constituem um contrato legal entre você (Usuário) e a MusicPro. Ao criar uma conta, você declara ter lido, compreendido e aceito integralmente estes Termos e nossa Política de Privacidade. Usuários menores de 18 anos devem ter consentimento dos responsáveis legais.`
          },
          {
            num: "2",
            title: "Descrição do Serviço",
            content: `O MusicPro é uma plataforma SaaS (Software como Serviço) voltada para gestão de escolas de música, oferecendo:`,
            items: [
              { label: "Gestão de alunos e professores", text: "Cadastro, histórico, evolução e comunicação." },
              { label: "Controle financeiro", text: "Mensalidades, cobranças e integração com Asaas." },
              { label: "Agenda e aulas", text: "Agendamento, controle de frequência e relatórios." },
              { label: "Portal do aluno", text: "Acesso digital para acompanhamento do progresso." },
              { label: "Automações", text: "Envio de mensagens via WhatsApp e lembretes automáticos." },
            ]
          },
          {
            num: "3",
            title: "Cadastro e Conta",
            content: null,
            items: [
              { label: "Veracidade", text: "Você se compromete a fornecer informações verdadeiras, precisas e atualizadas no cadastro." },
              { label: "Segurança da senha", text: "Você é responsável por manter a confidencialidade de suas credenciais de acesso." },
              { label: "Notificação de comprometimento", text: "Em caso de acesso não autorizado à sua conta, notifique-nos imediatamente." },
              { label: "Uma conta por escola", text: "Cada escola deve ter apenas uma conta ativa. A criação de múltiplas contas pode resultar em suspensão." },
            ]
          },
          {
            num: "4",
            title: "Planos e Pagamentos",
            content: null,
            items: [
              { label: "Período de teste", text: "Novos usuários têm direito a um período de teste gratuito conforme informado no momento do cadastro." },
              { label: "Cobrança recorrente", text: "Após o período de teste, a assinatura é cobrada mensalmente ou anualmente conforme o plano escolhido." },
              { label: "Preços", text: "Os valores dos planos são exibidos na plataforma e podem ser alterados mediante aviso prévio de 30 dias." },
              { label: "Cancelamento", text: "Você pode cancelar a assinatura a qualquer momento. O acesso permanece até o fim do período pago." },
              { label: "Reembolso", text: "Não oferecemos reembolso proporcional por cancelamentos antecipados, exceto em caso de falha comprovada do serviço." },
            ]
          },
          {
            num: "5",
            title: "Uso Permitido",
            content: `A plataforma deve ser utilizada exclusivamente para fins legítimos de gestão escolar musical. É expressamente proibido:`,
            items: [
              { label: "Uso fraudulento", text: "Usar a plataforma para fins ilegais, fraudulentos ou prejudiciais a terceiros." },
              { label: "Engenharia reversa", text: "Tentar descompilar, fazer engenharia reversa ou extrair o código-fonte da plataforma." },
              { label: "Revenda não autorizada", text: "Revender, sublicenciar ou transferir o acesso à plataforma sem autorização expressa." },
              { label: "Sobrecarga", text: "Realizar ataques, spam ou qualquer ação que sobrecarregue nossa infraestrutura." },
              { label: "Dados de terceiros", text: "Inserir dados pessoais de terceiros sem o consentimento adequado (obrigação do Operador)." },
            ]
          },
          {
            num: "6",
            title: "Responsabilidade pelos Dados dos Alunos",
            content: `Você, como escola/professor (Operador), é responsável pelos dados pessoais dos alunos que inserir na plataforma. Isso inclui obter os consentimentos necessários dos alunos e/ou responsáveis legais conforme a LGPD. O MusicPro atua como Operador de dados em relação a estas informações e as processa conforme suas instruções.`
          },
          {
            num: "7",
            title: "Propriedade Intelectual",
            content: `Todo o conteúdo da plataforma (código, design, textos, marca MusicPro) é propriedade exclusiva da MusicPro e protegido por leis de propriedade intelectual. Os dados inseridos por você (alunos, aulas, financeiro) permanecem de sua propriedade. Você concede ao MusicPro uma licença limitada para processar esses dados com o objetivo exclusivo de prestar os serviços contratados.`
          },
          {
            num: "8",
            title: "Disponibilidade e SLA",
            content: `Nos esforçamos para manter a plataforma disponível 24/7, porém não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência. Em caso de indisponibilidade prolongada (superior a 24h), analisaremos caso a caso a possibilidade de compensação.`
          },
          {
            num: "9",
            title: "Limitação de Responsabilidade",
            content: `O MusicPro não se responsabiliza por perdas indiretas, lucros cessantes ou danos consequentes resultantes do uso ou impossibilidade de uso da plataforma. Nossa responsabilidade total, em qualquer hipótese, está limitada ao valor pago pelo Usuário nos últimos 3 (três) meses de assinatura.`
          },
          {
            num: "10",
            title: "Rescisão",
            content: `Podemos suspender ou encerrar sua conta em caso de violação destes Termos, sem necessidade de aviso prévio. Você pode encerrar sua conta a qualquer momento pela área de configurações da plataforma ou pelo suporte. Após o encerramento, seus dados serão retidos conforme nossa Política de Privacidade.`
          },
          {
            num: "11",
            title: "Alterações nos Termos",
            content: `Podemos modificar estes Termos a qualquer momento. Notificaremos você com pelo menos 15 dias de antecedência sobre mudanças substanciais. O uso continuado da plataforma após a data de vigência das novas condições constitui aceitação tácita.`
          },
          {
            num: "12",
            title: "Lei Aplicável e Foro",
            content: `Estes Termos são regidos pelas leis da República Federativa do Brasil. Para resolução de quaisquer disputas, fica eleito o Foro da Comarca de Governador Valadares/MG, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`
          },
        ].map((section) => (
          <section key={section.num} className="border border-border/50 rounded-2xl p-8">
            <h2 className="text-xl font-black text-foreground mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-sm font-black flex-shrink-0">
                {section.num}
              </span>
              {section.title}
            </h2>
            {section.content && (
              <p className="text-muted-foreground leading-relaxed mb-4">{section.content}</p>
            )}
            {section.items && (
              <ul className="space-y-3">
                {section.items.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
                    <span className="text-muted-foreground leading-relaxed">
                      <strong className="text-foreground">{item.label}:</strong> {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10 mt-8 bg-muted/20">
        <div className="max-w-4xl mx-auto px-6 text-center text-muted-foreground font-medium text-sm">
          <p>© {new Date().getFullYear()} MusicPro. Todos os direitos reservados.</p>
          <p className="mt-2">
            <Link href="/politica-de-privacidade" className="hover:text-primary transition-colors">Política de Privacidade</Link>
            {" · "}
            <Link href="/" className="hover:text-primary transition-colors">Voltar à Landing Page</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

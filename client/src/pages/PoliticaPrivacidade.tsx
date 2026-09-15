import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";

export default function PoliticaPrivacidade() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = "Política de Privacidade — MusicPro";
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
            <Shield size={20} />
            MusicPro
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 to-indigo-500/10 border-b border-border/50 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6">
            <Shield size={14} />
            LGPD Compliant
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4 tracking-tight">
            Política de Privacidade
          </h1>
          <p className="text-muted-foreground font-medium max-w-xl mx-auto">
            Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16 space-y-12">

        <section className="prose prose-lg max-w-none">
          <p className="text-muted-foreground leading-relaxed text-lg">
            A <strong className="text-foreground">MusicPro</strong> ("nós", "nossa", "plataforma") está comprometida em proteger a privacidade e os dados pessoais de todos os usuários. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos suas informações, em conformidade com a <strong className="text-foreground">Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>.
          </p>
        </section>

        {[
          {
            num: "1",
            title: "Quem somos",
            content: `A MusicPro é uma plataforma de gestão para escolas de música, desenvolvida e operada no Brasil. Somos o Controlador dos seus dados pessoais conforme definido pela LGPD. Para entrar em contato conosco sobre privacidade: contato via WhatsApp (33) 98405-5949.`
          },
          {
            num: "2",
            title: "Dados que coletamos",
            content: null,
            items: [
              { label: "Dados de cadastro", text: "Nome completo, e-mail, telefone, CPF (quando necessário para integração financeira)." },
              { label: "Dados de uso", text: "Informações sobre como você usa a plataforma, páginas acessadas, funcionalidades utilizadas." },
              { label: "Dados financeiros", text: "Processados pela Asaas (nosso gateway de pagamento). Não armazenamos dados de cartão de crédito." },
              { label: "Dados de alunos", text: "Nome, contato, instrumento, histórico de aulas — inseridos pelo professor/escola responsável." },
              { label: "Dados técnicos", text: "Endereço IP, tipo de navegador, sistema operacional, para fins de segurança e melhoria do serviço." },
            ]
          },
          {
            num: "3",
            title: "Finalidade do tratamento",
            content: null,
            items: [
              { label: "Execução do contrato", text: "Fornecer as funcionalidades da plataforma que você contratou." },
              { label: "Legítimo interesse", text: "Melhorar continuamente a plataforma e prevenir fraudes." },
              { label: "Cumprimento legal", text: "Atender obrigações legais e regulatórias brasileiras." },
              { label: "Consentimento", text: "Enviar comunicações de marketing, quando autorizado por você." },
            ]
          },
          {
            num: "4",
            title: "Compartilhamento de dados",
            content: `Não vendemos seus dados. Compartilhamos apenas com:`,
            items: [
              { label: "Asaas", text: "Gateway de pagamentos, para processar cobranças e assinaturas." },
              { label: "Firebase (Google)", text: "Autenticação de usuários." },
              { label: "Autoridades competentes", text: "Quando exigido por lei ou ordem judicial." },
            ]
          },
          {
            num: "5",
            title: "Seus direitos (LGPD Art. 18)",
            content: `Você tem os seguintes direitos sobre seus dados pessoais:`,
            items: [
              { label: "Acesso", text: "Solicitar uma cópia dos dados que temos sobre você." },
              { label: "Correção", text: "Corrigir dados incompletos, inexatos ou desatualizados." },
              { label: "Exclusão", text: "Solicitar a exclusão dos seus dados (exceto quando há obrigação legal de retenção)." },
              { label: "Portabilidade", text: "Receber seus dados em formato estruturado." },
              { label: "Revogação do consentimento", text: "Retirar consentimentos previamente dados." },
            ]
          },
          {
            num: "6",
            title: "Retenção de dados",
            content: `Mantemos seus dados pelo tempo necessário para prestar os serviços contratados. Após o encerramento da conta, os dados são mantidos por até 5 (cinco) anos para cumprimento de obrigações legais e fiscais, conforme a legislação brasileira.`
          },
          {
            num: "7",
            title: "Segurança",
            content: `Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia em trânsito (TLS/HTTPS), controle de acesso por autenticação, backups regulares e monitoramento de segurança. Em caso de incidente que afete seus dados, notificaremos conforme exigido pela LGPD.`
          },
          {
            num: "8",
            title: "Cookies",
            content: `Utilizamos cookies essenciais para o funcionamento da plataforma (sessão de login, preferências de tema). Não utilizamos cookies de rastreamento de terceiros para publicidade.`
          },
          {
            num: "9",
            title: "Alterações nesta política",
            content: `Podemos atualizar esta Política periodicamente. Notificaremos você por e-mail ou aviso dentro da plataforma sobre mudanças relevantes. O uso continuado da plataforma após as alterações implica aceitação da nova versão.`
          },
          {
            num: "10",
            title: "Contato com o DPO",
            content: `Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato com nosso Encarregado de Dados (DPO) pelo WhatsApp: (33) 98405-5949 ou pelo e-mail exibido dentro da plataforma.`
          },
        ].map((section) => (
          <section key={section.num} className="border border-border/50 rounded-2xl p-8">
            <h2 className="text-xl font-black text-foreground mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-black flex-shrink-0">
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
                    <span className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
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
            <Link href="/termos-de-uso" className="hover:text-primary transition-colors">Termos de Uso</Link>
            {" · "}
            <Link href="/" className="hover:text-primary transition-colors">Voltar à Landing Page</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

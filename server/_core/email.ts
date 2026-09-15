import { debugLog } from "./logger";
import axios from "axios";
import { ENV } from "./env";

export async function sendVerificationEmail(email: string, token: string) {
  if (!ENV.resendApiKey) {
    console.warn("[Email] RESEND_API_KEY not found. Skipping verification email for:", email);
    debugLog(`[Email Mock] Verification link: ${ENV.appUrl}/verify-email?token=${token}`);
    return;
  }

  const verificationUrl = `${ENV.appUrl}/verify-email?token=${token}`;

  try {
    const response = await axios.post(
      "https://api.resend.com/emails",
      {
        from: ENV.resendFromEmail,
        to: [email],
        subject: "Verifique sua conta - WR Music App",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 40px; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">Verifique sua conta</h1>
              <p style="color: #6b7280; margin-top: 10px;">Music App - Dashboard de Gestão</p>
            </div>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.5;">Olá! Para ativar sua conta, use o código de verificação abaixo:</p>
            
            <div style="margin: 30px 0; text-align: center;">
              <div style="background-color: #ffffff; border: 2px dashed #4f46e5; padding: 20px; border-radius: 12px; display: inline-block;">
                <span style="font-size: 42px; font-weight: bold; letter-spacing: 8px; color: #4f46e5; font-family: monospace;">${token}</span>
              </div>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center;">Ou se preferir, clique no botão abaixo para verificar automaticamente:</p>
            
            <div style="margin: 20px 0; text-align: center;">
              <a href="${verificationUrl}" 
                 style="background-color: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                Ativar Minha Conta
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 40px;">
              Este código expira em 1 hora.<br>
              Se você não criou esta conta, pode ignorar este e-mail.
            </p>
          </div>
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.resendApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    debugLog("[Email] Verification email sent to:", email, response.data.id);
  } catch (error: any) {
    const errorData = error.response?.data;
    console.error("[Email] Failed to send verification email:", errorData || error.message);
    
    if (errorData?.message?.includes("Unauthorized recipient")) {
      throw new Error("Erro: O domínio da Resend ainda não foi verificado para enviar e-mails a terceiros.");
    }
    
    throw new Error("Falha ao enviar e-mail de verificação. Verifique os logs do servidor.");
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!ENV.resendApiKey) {
    console.warn("[Email] RESEND_API_KEY not found. Skipping password reset email for:", email);
    debugLog(`[Email Mock] Reset link: ${ENV.appUrl}/reset-password?token=${token}`);
    return;
  }

  const resetUrl = `${ENV.appUrl}/reset-password?token=${token}`;

  try {
    await axios.post(
      "https://api.resend.com/emails",
      {
        from: ENV.resendFromEmail,
        to: [email],
        subject: "Recuperação de Senha - WR Music App",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4f46e5;">Recuperação de Senha</h1>
            <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para prosseguir:</p>
            <div style="margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                Redefinir Minha Senha
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Este link expira em 1 hora.</p>
            <p style="color: #999; font-size: 12px;">Se você não solicitou isso, ignore este e-mail.</p>
          </div>
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.resendApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    debugLog("[Email] Password reset email sent to:", email);
  } catch (error: any) {
    console.error("[Email] Failed to send password reset email:", error.response?.data || error.message);
  }
}

export async function sendSimpleEmail(email: string, subject: string, html: string) {
  if (!ENV.resendApiKey) {
    console.warn("[Email] RESEND_API_KEY not found. Skipping simple email for:", email);
    return;
  }

  try {
    const response = await axios.post(
      "https://api.resend.com/emails",
      {
        from: ENV.resendFromEmail,
        to: [email],
        subject: subject,
        html: html,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.resendApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    debugLog("[Email] Simple email sent to:", email, response.data.id);
  } catch (error: any) {
    console.error("[Email] Failed to send simple email:", error.response?.data || error.message);
  }
}

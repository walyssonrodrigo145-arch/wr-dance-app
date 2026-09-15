import { sendWhatsAppMessage, humanDelay } from "./whatsapp";

export interface RoutingParams {
  sendToStudent: boolean;
  sendToGuardian: boolean;
  student: { 
    phone?: string | null; 
    guardianPhone?: string | null; 
    birthDate?: string | Date | null;
  };
  message: string;
  sessionId: string;
  whatsappConfig: {
    url: string | null;
    token: string | null;
  };
}

/**
 * Envia uma mensagem de WhatsApp aplicando regras de roteamento inteligente
 * e fallback (Plano B) caso o telefone principal selecionado não exista.
 */
export async function sendSmartWhatsAppNotification({ 
  sendToStudent, 
  sendToGuardian, 
  student, 
  message, 
  sessionId,
  whatsappConfig
}: RoutingParams): Promise<{ success: boolean; errors?: string[] }> {
  
  if (!whatsappConfig.url || !whatsappConfig.token) {
    return { success: false, errors: ["Configuração do WhatsApp Bot ausente"] };
  }

  const hasStudentPhone = !!student.phone && student.phone.trim().length > 0;
  const hasGuardianPhone = !!student.guardianPhone && student.guardianPhone.trim().length > 0;

  const targetPhones: string[] = [];

  // Se marcar para enviar para o Aluno e ele tiver telefone, adiciona
  if (sendToStudent && hasStudentPhone) {
    targetPhones.push(student.phone!);
  }

  // Se marcar para enviar para o Responsável e ele tiver telefone, adiciona
  if (sendToGuardian && hasGuardianPhone) {
    targetPhones.push(student.guardianPhone!);
  }

  // --- PLANO B (FALLBACK) ---
  // Se o resultado for 0 números (ex: marcou para enviar pro responsável, mas não há responsável preenchido)
  if (targetPhones.length === 0) {
    // Se marcou apenas Responsável, mas ele não tem, e o aluno/família possui telefone cadastrado -> Envia para o telefone de contato cadastrado
    if (sendToGuardian && !hasGuardianPhone && hasStudentPhone) {
      targetPhones.push(student.phone!);
    }
    // Se marcou apenas Aluno, mas ele não tem, e o responsável tem -> Envia para o Responsável
    else if (sendToStudent && !hasStudentPhone && hasGuardianPhone) {
      targetPhones.push(student.guardianPhone!);
    }
  }

  const uniquePhones = Array.from(new Set(targetPhones));
  const errors: string[] = [];

  for (const phone of uniquePhones) {
    try {
      const res = await sendWhatsAppMessage({ 
        url: whatsappConfig.url,
        token: whatsappConfig.token,
        phone, 
        message, 
        sessionId 
      });
      if (!res.success) {
        errors.push(`Erro ao enviar para ${phone}: ${res.error || 'Desconhecido'}`);
      }
      // ANTI-BAN: delay humanizado aleat\u00f3rio entre mensagens (3s~10s)
      await humanDelay(3000, 10000);
    } catch (err: any) {
      errors.push(`Erro ao enviar para ${phone}: ${err?.message || 'Desconhecido'}`);
    }
  }

  return { 
    success: errors.length === 0 && uniquePhones.length > 0,
    errors: errors.length > 0 ? errors : (uniquePhones.length === 0 ? ["Nenhum telefone válido encontrado para envio."] : undefined)
  };
}

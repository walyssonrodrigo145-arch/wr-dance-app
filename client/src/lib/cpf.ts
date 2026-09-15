export function validateCPF(cpf: string): string | null {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (!cleanCPF) return null;
  if (cleanCPF.length !== 11) {
    return "CPF deve ter 11 dígitos";
  }
  if (/^(\d)\1{10}$/.test(cleanCPF)) {
    return "CPF inválido (não pode conter apenas dígitos repetidos)";
  }
  
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCPF.charAt(9))) {
    return "CPF inválido";
  }
  
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCPF.charAt(10))) {
    return "CPF inválido";
  }
  
  return null; // Null means valid
}

import React, { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import QRCode from "react-qr-code";
import QRCodeLib from "qrcode";
import { Printer, Download, Music, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface PrintableQrBannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolName: string;
  schoolLogo?: string | null;
  token: string | null;
}

export function PrintableQrBannerModal({
  open,
  onOpenChange,
  schoolName,
  schoolLogo,
  token,
}: PrintableQrBannerModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // ─── 1. Impressão via Janela Dedicada (100% à prova de falhas) ───
  const handlePrint = () => {
    if (!token) {
      toast.error("Token do QR Code não encontrado. Recarregue a página.");
      return;
    }

    try {
      const qrData = QRCodeLib.create(token, { errorCorrectionLevel: "Q" });
      const moduleCount = qrData.modules.size;
      const marginModules = 2;
      const totalModules = moduleCount + marginModules * 2;
      const qrSize = 340;
      const modulePixelSize = qrSize / totalModules;

      // Gera SVG inline puro para impressão nítida
      let qrRects = "";
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qrData.modules.get(row, col)) {
            const x = (col + marginModules) * modulePixelSize;
            const y = (row + marginModules) * modulePixelSize;
            qrRects += `<rect x="${x}" y="${y}" width="${Math.ceil(modulePixelSize)}" height="${Math.ceil(modulePixelSize)}" fill="#000000" />`;
          }
        }
      }

      const printHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Totem de Presença — ${schoolName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #ffffff; color: #0f172a; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .card {
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      background: #ffffff;
      border: 4px solid #4f46e5;
      border-radius: 28px;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.05);
    }
    .badge {
      display: inline-block;
      padding: 6px 16px;
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      color: #4338ca;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .school-title {
      font-size: 22px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .action-title {
      font-size: 16px;
      font-weight: 800;
      color: #4f46e5;
      margin-bottom: 4px;
    }
    .instruction {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 20px;
      font-weight: 600;
    }
    .qr-wrapper {
      background: #ffffff;
      border: 2px solid #e0e7ff;
      border-radius: 20px;
      padding: 16px;
      display: inline-block;
      margin-bottom: 20px;
    }
    .steps-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      padding: 16px;
      text-align: left;
      margin-bottom: 16px;
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .step-item:last-child { margin-bottom: 0; }
    .step-badge {
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      background: #4f46e5;
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .step-badge.check { background: #059669; }
    .step-text { font-size: 12px; font-weight: 700; color: #334155; }
    .footer { font-size: 11px; color: #94a3b8; font-weight: 600; }
    @media print {
      body { padding: 0; }
      .card { box-shadow: none; border: 4px solid #4f46e5 !important; }
      @page { margin: 10mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✦ PRESENÇA DIGITAL ✦</div>
    <h1 class="school-title">${schoolName}</h1>
    <div class="action-title">Faça seu Check-in de Aula</div>
    <p class="instruction">Aponte a câmera do seu celular para o QR Code abaixo</p>
    <div class="qr-wrapper">
      <svg width="${qrSize}" height="${qrSize}" viewBox="0 0 ${qrSize} ${qrSize}" xmlns="http://www.w3.org/2000/svg">
        ${qrRects}
      </svg>
    </div>
    <div class="steps-box">
      <div class="step-item">
        <div class="step-badge">1</div>
        <div class="step-text">Abra a câmera ou o <b>Portal do Aluno</b></div>
      </div>
      <div class="step-item">
        <div class="step-badge">2</div>
        <div class="step-text">Aponte para o <b>QR Code</b></div>
      </div>
      <div class="step-item">
        <div class="step-badge check">✓</div>
        <div class="step-text" style="color: #065f46;">Pronto! Sua presença foi confirmada.</div>
      </div>
    </div>
    <div class="footer">Totem Oficial • ${schoolName} • MusicPro</div>
  </div>
</body>
</html>`;

      const printWin = window.open("", "_blank", "width=800,height=900");
      if (printWin) {
        printWin.document.open();
        printWin.document.write(printHtml);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
        }, 300);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao preparar impressão do totem.");
    }
  };

  // ─── 2. Download do PNG via Canvas 2D Puro (100% síncrono e matemático) ───
  const handleDownloadPng = () => {
    if (!token) {
      toast.error("Token do QR Code não encontrado. Recarregue a página.");
      return;
    }

    try {
      toast.loading("Gerando imagem em alta resolução...", { id: "qr-download" });

      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      if (!ctx) { toast.dismiss("qr-download"); return; }

      // Fundo branco limpo
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Borda decorativa azul índigo
      ctx.strokeStyle = "#4f46e5";
      ctx.lineWidth = 14;
      ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

      // Badge superior "PRESENÇA DIGITAL"
      const badgeW = 340;
      const badgeH = 50;
      const badgeX = (canvas.width - badgeW) / 2;
      ctx.fillStyle = "#eef2ff";
      if (ctx.roundRect) ctx.roundRect(badgeX, 68, badgeW, badgeH, 25); else ctx.rect(badgeX, 68, badgeW, badgeH);
      ctx.fill();
      ctx.strokeStyle = "#c7d2fe";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#4338ca";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✦  PRESENÇA DIGITAL  ✦", canvas.width / 2, 103);

      // Nome da Escola
      ctx.fillStyle = "#0f172a";
      ctx.font = "900 52px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(schoolName.toUpperCase(), canvas.width / 2, 190);

      // Subtítulo
      ctx.fillStyle = "#4f46e5";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("FAÇA SEU CHECK-IN DE AULA", canvas.width / 2, 244);

      // Instrução
      ctx.fillStyle = "#64748b";
      ctx.font = "500 22px sans-serif";
      ctx.fillText("Aponte a câmera do celular para o QR Code abaixo", canvas.width / 2, 285);

      // Caixa branca do QR Code
      const qrBoxSize = 640;
      const qrBoxX = (canvas.width - qrBoxSize) / 2;
      const qrBoxY = 320;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28);
      } else {
        ctx.rect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      }
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e0e7ff";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Desenho dos módulos do QR Code usando a matriz matemática pura
      const qrData = QRCodeLib.create(token, { errorCorrectionLevel: "Q" });
      const moduleCount = qrData.modules.size;
      const marginModules = 2;
      const totalModules = moduleCount + marginModules * 2;
      const innerSize = 560;
      const modulePixelSize = innerSize / totalModules;
      const drawOffsetX = (canvas.width - innerSize) / 2;
      const drawOffsetY = qrBoxY + (qrBoxSize - innerSize) / 2;

      ctx.fillStyle = "#000000";
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qrData.modules.get(row, col)) {
            const x = drawOffsetX + (col + marginModules) * modulePixelSize;
            const y = drawOffsetY + (row + marginModules) * modulePixelSize;
            ctx.fillRect(
              Math.floor(x),
              Math.floor(y),
              Math.ceil(modulePixelSize) + 1,
              Math.ceil(modulePixelSize) + 1
            );
          }
        }
      }

      // Caixa dos 3 Passos
      const stepsY = 1020;
      const stepsW = 920;
      const stepsH = 270;
      const stepsX = (canvas.width - stepsW) / 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(stepsX, stepsY, stepsW, stepsH, 24);
      } else {
        ctx.rect(stepsX, stepsY, stepsW, stepsH);
      }
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.stroke();

      const drawStep = (num: string, text: string, y: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(stepsX + 52, y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(num, stepsX + 52, y + 8);
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(text, stepsX + 94, y + 9);
      };

      drawStep("1", "Abra a câmera do celular ou o Portal do Aluno", stepsY + 58, "#4f46e5");
      drawStep("2", "Aponte para este QR Code de presença", stepsY + 138, "#4f46e5");

      // Passo 3
      ctx.fillStyle = "#059669";
      ctx.beginPath();
      ctx.arc(stepsX + 52, stepsY + 218, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✓", stepsX + 52, stepsY + 226);
      ctx.fillStyle = "#065f46";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Pronto! Sua presença foi confirmada.", stepsX + 94, stepsY + 227);

      // Rodapé
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Totem Oficial  •  ${schoolName}  •  MusicPro`, canvas.width / 2, 1520);

      // Exportação e Download
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `totem-presenca-qrcode-${schoolName.toLowerCase().replace(/\s+/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Placa QR Code baixada em alta resolução!", { id: "qr-download" });
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
      toast.error("Erro ao gerar a imagem do totem.", { id: "qr-download" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] flex flex-col p-0 border border-white/10 bg-slate-950 text-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header fixo no topo */}
        <DialogHeader className="p-5 px-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-slate-900/80 backdrop-blur-md">
          <div className="min-w-0">
            <DialogTitle className="text-lg sm:text-xl font-black uppercase tracking-wider flex items-center gap-2.5 text-white">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <Printer size={16} />
              </div>
              <span>Imprimir Totem / Placa de Recepção</span>
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Gere a placa em alta definição para fixar na recepção ou nas salas de aula da sua escola.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!token}
              onClick={handleDownloadPng}
              className="gap-2 rounded-xl bg-white/5 hover:bg-white/15 border-white/15 text-white font-bold text-xs h-9 px-4 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              {token ? "Baixar PNG (HD)" : "Gerando..."}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!token}
              onClick={handlePrint}
              className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-5 shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer size={14} />
              Imprimir
            </Button>
          </div>
        </DialogHeader>

        {/* ── Visualização da Folha / Totem com scroll sutil apenas quando necessário ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-center justify-center bg-slate-950/90 subtle-scrollbar">
          <div
            ref={printRef}
            id="printable-totem-card"
            className="w-full max-w-[420px] bg-white text-slate-900 rounded-3xl p-6 border-4 border-indigo-600 shadow-2xl flex flex-col items-center text-center relative overflow-hidden my-auto"
          >
            {/* Top Badge */}
            <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-black uppercase tracking-widest mb-3">
              <Sparkles size={12} />
              Presença Digital
            </div>

            {/* Logo & School Name */}
            <div className="flex flex-col items-center gap-1.5 mb-3">
              {schoolLogo ? (
                <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 p-1 flex items-center justify-center bg-white shadow-sm">
                  <img src={schoolLogo} alt={schoolName} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Music size={24} />
                </div>
              )}
              <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                {schoolName}
              </h2>
            </div>

            {/* Chamada */}
            <div className="mb-3">
              <h3 className="text-base font-black text-indigo-900 leading-tight">
                Faça seu Check-in de Aula
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Aponte a câmera do seu celular para o QR Code abaixo
              </p>
            </div>

            {/* QR Code Container */}
            <div className="p-3 bg-slate-50 border-2 border-indigo-100 rounded-2xl shadow-inner mb-4">
              {token ? (
                <QRCode
                  id="qr-code-totem-svg"
                  value={token}
                  size={200}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  level="Q"
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center text-slate-400 text-xs">
                  Gerando código...
                </div>
              )}
            </div>

            {/* 3 Passos */}
            <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-left space-y-1.5 mb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                  1
                </span>
                <p className="text-[11px] font-bold text-slate-700">
                  Abra a câmera ou o <b>Portal do Aluno</b>
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                  2
                </span>
                <p className="text-[11px] font-bold text-slate-700">
                  Aponte para o <b>QR Code</b>
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                  ✓
                </span>
                <p className="text-[11px] font-bold text-emerald-800">
                  Pronto! Sua presença foi confirmada.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold">
              <Shield size={11} className="text-indigo-500" />
              <span>Totem Oficial • {schoolName}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import jsQR from "jsqr";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
  CameraOff,
  RefreshCw,
  ScanLine,
} from "lucide-react";

type ScanState = "idle" | "scanning" | "success" | "error";

// Visual overlays for the scanner
const SuccessOverlay = ({ name }: { name?: string }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/20 backdrop-blur-sm z-50"
  >
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", bounce: 0.5 }}
      className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.4)] mb-4"
    >
      <CheckCircle2 size={48} className="text-white" />
    </motion.div>
    <motion.h2
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="text-2xl font-bold text-white text-center"
    >
      Presença Confirmada!
    </motion.h2>
    {name && (
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-emerald-100 mt-2 text-center"
      >
        Bom treino, {name}!
      </motion.p>
    )}
  </motion.div>
);

const ErrorOverlay = ({ message }: { message?: string }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/20 backdrop-blur-sm z-50 p-6"
  >
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", bounce: 0.5 }}
      className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)] mb-4"
    >
      <XCircle size={40} className="text-white" />
    </motion.div>
    <motion.h2
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="text-xl font-bold text-white text-center mb-2"
    >
      Erro no Registro
    </motion.h2>
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="text-white/60 text-center max-w-xs"
    >
      {message}
    </motion.p>
  </motion.div>
);

const JSQRScanner = ({ onScan, onError, paused }: { onScan: (code: string) => void, onError: (err: any) => void, paused?: boolean }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        onError(err);
      }
    };

    const tick = () => {
      if (paused) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }
      
      if (
        videoRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
      ) {
        const canvasElement = canvasRef.current;
        const canvas = canvasElement?.getContext("2d", { willReadFrequently: true });
        
        if (canvasElement && canvas) {
          canvasElement.height = videoRef.current.videoHeight;
          canvasElement.width = videoRef.current.videoWidth;
          canvas.drawImage(videoRef.current, 0, 0, canvasElement.width, canvasElement.height);
          
          try {
            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            
            if (code && code.data) {
              onScan(code.data);
            }
          } catch (e) {
            // Ignore scan errors, just continue
          }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [paused]);

  return (
    <>
      <video ref={videoRef} className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
};

export default function QRScanner() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successName, setSuccessName] = useState<string | undefined>();
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scanMutation = trpc.attendance.scan.useMutation({
    onSuccess: (data: any) => {
      setScanState("success");
      setSuccessName(data?.userName ?? user?.name);
      setTimeout(() => {
        setScanState("idle");
        setSuccessName(undefined);
      }, 3000);
    },
    onError: (err: any) => {
      setScanState("error");
      setErrorMessage(
        err.message || "Token inválido ou expirado. Tente novamente."
      );
      setTimeout(() => {
        setScanState("idle");
        setErrorMessage("");
      }, 3000);
    },
  });

  const handleScan = useCallback(
    (tokenValue: string) => {
      const cleaned = tokenValue.trim();
      if (!cleaned || scanState !== "idle") return;

      setScanState("scanning");
      scanMutation.mutate({ token: cleaned });
    },
    [scanMutation, scanState]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-4 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
          onClick={() => navigate(-1 as any)}
        >
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">Registrar Presença</h1>
          <p className="text-xs text-white/40">
            Escaneie o QR Code na recepção
          </p>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
          <Shield size={14} className="text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-300">Seguro</span>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 px-4 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key="camera"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="relative h-full flex flex-col"
          >
            {/* Camera view */}
            <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4] max-h-[60vh] w-full max-w-sm mx-auto shadow-2xl border border-white/10 mt-8">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
                  <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                    <CameraOff size={36} className="text-red-400" />
                  </div>
                  <p className="text-white/60 text-center text-sm">
                    {cameraError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="border-white/20 text-white hover:bg-white/10 rounded-xl"
                  >
                    <RefreshCw size={14} className="mr-2" />
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <>
                  <JSQRScanner
                    paused={scanState !== "idle"}
                    onScan={(code: string) => {
                      handleScan(code);
                    }}
                    onError={(err: any) => {
                      console.error("Scanner Error:", err);
                      const msg = err?.message?.toLowerCase() || "";
                      
                      if (err?.name === "NotAllowedError" || msg.includes("permission") || msg.includes("denied")) {
                        setCameraError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
                      } else if (err?.name === "NotFoundError" || msg.includes("not found")) {
                        setCameraError("Nenhuma câmera encontrada no dispositivo.");
                      } else {
                        setCameraError("Erro na câmera: " + (err?.message || "Falha desconhecida"));
                      }
                    }}
                  />
                  {/* Decorative corners for scanner */}
                  <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-indigo-500/70 rounded-tl-xl" />
                  <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-indigo-500/70 rounded-tr-xl" />
                  <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-indigo-500/70 rounded-bl-xl" />
                  <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-indigo-500/70 rounded-br-xl" />
                </>
              )}

              {/* Overlays */}
              <AnimatePresence>
                {scanState === "success" && (
                  <SuccessOverlay name={successName} />
                )}
                {scanState === "error" && (
                  <ErrorOverlay message={errorMessage} />
                )}
                {scanState === "scanning" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-40"
                  >
                    <Loader2 size={40} className="text-indigo-400 animate-spin mb-4" />
                    <p className="text-white font-medium">Verificando Presença...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Camera instructions */}
            <div className="mt-8 text-center flex-1">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-4">
                <ScanLine size={16} className="text-indigo-400" />
                <p className="text-indigo-200 text-sm font-medium">
                  Posicione o QR Code na área marcada
                </p>
              </div>
              <p className="text-white/40 text-xs max-w-xs mx-auto">
                A câmera fará a leitura automaticamente. Certifique-se de estar com boa iluminação.
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

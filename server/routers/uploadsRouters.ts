// Uploads de imagens do sistema (produtos da Loja, eventos e afins).
// Recebe base64 do cliente, valida magic bytes/formato e grava no storage
// local (volume persistente) devolvendo a URL pública /uploads/fotos/org_X/...
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { checkFileMagicBytes } from "../utils/fileSecurity";
import { storagePut } from "../storage";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"] as const;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const uploadsRouters = {
  uploads: router({
    /**
     * Upload de imagem (até 8MB) com validação de conteúdo real.
     * Retorna `{ url }` pronta para salvar em produtos/eventos (photoUrl).
     */
    image: protectedProcedure
      .input(z.object({
        fileName: z.string().max(255),
        fileType: z.string().max(100),
        base64Data: z.string().max(12 * 1024 * 1024),
      }))
      .mutation(async ({ ctx, input }) => {
        const isStaff =
          ctx.user.role === "admin" ||
          ctx.user.role === "professor" ||
          (Boolean(ENV.ownerOpenId) && ctx.user.openId === ENV.ownerOpenId);
        if (!isStaff) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para enviar imagens." });
        }

        const base64 = input.base64Data.includes(",") ? input.base64Data.split(",")[1] : input.base64Data;
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
        if (buffer.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem maior que 8MB." });
        if (!input.fileType.startsWith("image/")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas imagens (JPG/PNG/WEBP/GIF)." });
        }
        if (!(ALLOWED_TYPES as readonly string[]).includes(input.fileType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não aceito. Envie JPG/PNG/WEBP/GIF." });
        }
        if (!checkFileMagicBytes(buffer, input.fileType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo não corresponde ao formato informado." });
        }

        const orgId = ctx.user.organizationId ?? 0;
        const ext = EXT_BY_MIME[input.fileType] || "jpg";
        const key = `fotos/org_${orgId}/${nanoid(12)}.${ext}`;
        const { url } = await storagePut(key, buffer, input.fileType);
        return { url };
      }),
  }),
};

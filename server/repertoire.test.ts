import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { studentRepertoire, students, notifications } from "../drizzle/schema";
import { extractYoutubeRef, buildEmbedSrc, buildThumbnailUrl } from "./utils/youtubeUrl";

// ─── Fake DB encadeável (mesmo padrão de repositions.test.ts) ────────────────

type RowMap = Map<any, any[]>;

function makeFakeDb(rows: RowMap) {
  const inserts: Array<{ table: any; values: any }> = [];
  const updates: Array<{ table: any; values: any }> = [];
  const getRows = (table: any) => rows.get(table) || [];

  const db: any = {
    select: () => {
      let current: any = null;
      const chain: any = {
        from: (t: any) => { current = t; return chain; },
        leftJoin: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve([...getRows(current)]),
        then: (resolve: any, reject: any) => Promise.resolve([...getRows(current)]).then(resolve, reject),
        catch: (fn: any) => Promise.resolve([...getRows(current)]).catch(fn),
      };
      return chain;
    },
    insert: (t: any) => ({
      values: (v: any) => {
        inserts.push({ table: t, values: v });
        return {
          returning: () => Promise.resolve([{ id: 999 }]),
          then: (resolve: any) => resolve({ count: 1 }),
        };
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        updates.push({ table: t, values: v });
        return {
          where: () => Promise.resolve({ count: 1 }),
          then: (resolve: any) => resolve({ count: 1 }),
        };
      },
    }),
    delete: () => ({
      where: () => Promise.resolve({ count: 1 }),
    }),
  };
  return { db, inserts, updates };
}

const h = vi.hoisted(() => ({ state: { db: null as any } }));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(async () => h.state.db),
    getSettingsByUserId: vi.fn(async () => null),
  };
});

function createCtx(overrides: Partial<any> = {}): TrpcContext {
  return {
    user: {
      id: 5,
      openId: "test-open-id",
      name: "Professor Teste",
      role: "professor",
      organizationId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const STUDENT_ROW = { id: 100, name: "Alice", professorId: 5, studentUserId: 200 };

// ─── Parser puro ─────────────────────────────────────────────────────────────

describe("extractYoutubeRef — parser de URL (RN-005)", () => {
  it("extrai videoId de watch?v=", () => {
    const r = extractYoutubeRef("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz&t=90s");
    expect(r).toEqual({ videoId: "dQw4w9WgXcQ", playlistId: "PLxyz" });
  });

  it("extrai de youtu.be (case-insensitive) e Shorts", () => {
    expect(extractYoutubeRef("https://YOUTU.BE/dQw4w9WgXcQ")?.videoId).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeRef("https://www.youtube.com/shorts/abc_def-123?si=x")?.videoId).toBe("abc_def-123");
  });

  it("extrai de /embed/ e /live/", () => {
    expect(extractYoutubeRef("https://www.youtube.com/embed/dQw4w9WgXcQ")?.videoId).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeRef("https://www.youtube.com/live/abc123xyz45")?.videoId).toBe("abc123xyz45");
  });

  it("aceita playlist sem vídeo (videoId null)", () => {
    const r = extractYoutubeRef("https://www.youtube.com/playlist?list=PLxyz789");
    expect(r).toEqual({ videoId: null, playlistId: "PLxyz789" });
  });

  it("rejeita links não-YouTube, maliciosos e vazios", () => {
    expect(extractYoutubeRef("https://vimeo.com/12345")).toBeNull();
    expect(extractYoutubeRef("javascript:alert(1)")).toBeNull();
    expect(extractYoutubeRef("")).toBeNull();
    expect(extractYoutubeRef("não é uma url")).toBeNull();
  });

  it("rejeita IDs com charset perigoso (segurança do iframe)", () => {
    expect(extractYoutubeRef("https://www.youtube.com/watch?v=<script>")).toBeNull();
  });
});

describe("buildEmbedSrc / thumbnail", () => {
  it("monta src no host PADRÃO do YouTube (Caça-Bug: nocookie causava Erro 153)", () => {
    expect(buildEmbedSrc({ videoId: "abc12345678", playlistId: null })).toBe(
      "https://www.youtube.com/embed/abc12345678?rel=0&playsinline=1"
    );
    expect(buildEmbedSrc({ videoId: "abc12345678", playlistId: "PL1" })).toContain("&list=PL1");
    expect(buildEmbedSrc({ videoId: null, playlistId: "PL1" })).toContain("videoseries?list=PL1");
    expect(buildEmbedSrc({ videoId: null, playlistId: null })).toBeNull();
  });

  it("miniatura usa CDN oficial com videoId validado", () => {
    expect(buildThumbnailUrl("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });
});

// ─── Fluxos tRPC ─────────────────────────────────────────────────────────────

beforeEach(() => {
  h.state.db = null as any;
});

describe("repertoire.create", () => {
  it("bloqueia professor sem vínculo com o aluno (RN-002)", async () => {
    const { db, inserts } = makeFakeDb(
      new Map([[students, [{ ...STUDENT_ROW, professorId: 77 }]]])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.repertoire.create({ studentId: 100, youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" })
    ).rejects.toThrow("permissão sobre este aluno");
    expect(inserts.filter((i) => i.table === studentRepertoire)).toHaveLength(0);
  });

  it("rejeita link inválido com mensagem controlada (CA-002)", async () => {
    const { db } = makeFakeDb(new Map([[students, [STUDENT_ROW]]]));
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.repertoire.create({ studentId: 100, youtubeUrl: "https://vimeo.com/999" })
    ).rejects.toThrow("Link do YouTube não reconhecido");
  });

  it("bloqueia música duplicada para o mesmo aluno (CA-003)", async () => {
    const { db } = makeFakeDb(
      new Map([
        [students, [STUDENT_ROW]],
        [studentRepertoire, [{ id: 50, studentId: 100, videoId: "dQw4w9WgXcQ" }]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.repertoire.create({ studentId: 100, youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
    ).rejects.toThrow("já está no repertório deste aluno");
  });

  it("cria com videoId extraído, notifica o aluno e usa título padrão (CA-001)", async () => {
    const { db, inserts } = makeFakeDb(
      new Map([
        [students, [STUDENT_ROW]],
        [studentRepertoire, []], // fake db ignora WHERE: tabela vazia = sem duplicados e position inicial
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.repertoire.create({
      studentId: 100,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
    const row = inserts.find((i) => i.table === studentRepertoire);
    expect(row.values.videoId).toBe("dQw4w9WgXcQ");
    expect(row.values.position).toBe(0);
    expect(row.values.organizationId).toBe(1);
    expect(row.values.title).toBe("Música 1"); // título default quando professor não informa
    const notif = inserts.find((i) => i.table === notifications);
    expect(notif).toBeDefined();
    expect(notif.values.userId).toBe(200);
  });
});

describe("repertoire.moveToStudent — correção de destino", () => {
  it("professor não-dono do aluno DESTINO não move (permissão nos dois lados)", async () => {
    const { db, updates } = makeFakeDb(
      new Map([
        [studentRepertoire, [{ id: 9, organizationId: 1, studentId: 100, videoId: "dQw4w9WgXcQ", position: 0, viewedAt: new Date(), learnedAt: new Date() }]],
        [students, [{ id: 200, name: "Bruno", professorId: 77 }]], // destino de OUTRO professor
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx({ role: "professor", id: 5 }));
    await expect(
      caller.repertoire.moveToStudent({ id: 9, targetStudentId: 200 })
    ).rejects.toThrow("permissão sobre o aluno de destino");
    expect(updates.filter((u) => u.table === studentRepertoire)).toHaveLength(0);
  });

  it("bloqueia mover quando o vídeo já existe no repertório do destino (RN-003)", async () => {
    const { db, updates } = makeFakeDb(
      new Map([
        [studentRepertoire, [
          { id: 9, organizationId: 1, studentId: 100, videoId: "dQw4w9WgXcQ", position: 0, viewedAt: null, learnedAt: null },
          { id: 10, organizationId: 1, studentId: 200, videoId: "dQw4w9WgXcQ", position: 0, viewedAt: null, learnedAt: null },
        ]],
        [students, [{ id: 200, name: "Bruno", professorId: 5 }]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.repertoire.moveToStudent({ id: 9, targetStudentId: 200 })
    ).rejects.toThrow("já está no repertório de Bruno");
    expect(updates.filter((u) => u.table === studentRepertoire)).toHaveLength(0);
  });

  it("move com sucesso: troca studentId, vai para o fim da fila e reinicia status", async () => {
    const { db, updates } = makeFakeDb(
      new Map([
        // Fake db ignora WHERE: row sem videoId pula o anti-dup (cubierto no teste anterior)
        [studentRepertoire, [
          { id: 9, organizationId: 1, studentId: 100, videoId: null, playlistId: "PLxyz", position: 2, viewedAt: new Date(), learnedAt: new Date() },
        ]],
        // A única row de students serve ao join da origem e ao select do destino
        [students, [{ id: 200, name: "Bruno", professorId: 5 }]],
        [notifications, []],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.repertoire.moveToStudent({ id: 9, targetStudentId: 200 });
    expect(result.moved).toBe(true);
    expect(result.targetName).toBe("Bruno");
    const upd = updates.find((u) => u.table === studentRepertoire);
    expect(upd.values.studentId).toBe(200);
    expect(upd.values.viewedAt).toBeNull();
    expect(upd.values.learnedAt).toBeNull();
  });
});

describe("repertoire.my / toggleLearned (aluno)", () => {
  it("aluno marca/desmarca Aprendida e pode reescutar (decisão do produto)", async () => {
    const { db, updates } = makeFakeDb(
      new Map([
        [studentRepertoire, [{ id: 9, studentId: 100, learnedAt: null }]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx({ role: "aluno", studentId: 100, id: 200 }));
    const result = await caller.repertoire.toggleLearned({ id: 9 });
    expect(result.learned).toBe(true);
    const upd = updates.find((u) => u.table === studentRepertoire);
    expect(upd.values.learnedAt).toBeInstanceOf(Date);
  });

  it("aluno não altera linha de outro aluno (isolamento)", async () => {
    const { db, updates } = makeFakeDb(
      new Map([[studentRepertoire, [{ id: 9, studentId: 555, learnedAt: null }]]])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx({ role: "aluno", studentId: 100, id: 200 }));
    await expect(caller.repertoire.toggleLearned({ id: 9 })).rejects.toThrow("não encontrada");
    expect(updates.filter((u) => u.table === studentRepertoire)).toHaveLength(0);
  });
});

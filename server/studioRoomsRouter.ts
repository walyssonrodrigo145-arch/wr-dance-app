import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { studioRooms, lessons, students } from "../drizzle/schema";
import { eq, and, sql, gte, lte, asc, desc } from "drizzle-orm";

let schemaEnsured = false;
async function ensureStudioRoomsSchema(db: any) {
  if (schemaEnsured) return;
  try {
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "category" varchar(100) DEFAULT 'Estúdio de gravação' NOT NULL`);
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "capacity" integer DEFAULT 8 NOT NULL`);
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "equipments" text DEFAULT 'Bateria, Teclado, Ar Condicionado' NOT NULL`);
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'ativa' NOT NULL`);
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "imageUrl" text`);
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "utilization_rate" integer DEFAULT 75 NOT NULL`);
    await db.execute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "is_principal" boolean DEFAULT false NOT NULL`);
    schemaEnsured = true;
  } catch (e: any) {
    console.warn("ensureStudioRoomsSchema failed:", e?.message);
  }
}

export const studioRoomsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await ensureStudioRoomsSchema(db);
    const orgId = ctx.user.organizationId!;
    return db.select().from(studioRooms).where(eq(studioRooms.organizationId, orgId));
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, active: 0, maintenance: 0, avgUtilization: 0, avgRating: 4.8 };
    await ensureStudioRoomsSchema(db);
    const orgId = ctx.user.organizationId!;
    const rooms = await db.select().from(studioRooms).where(eq(studioRooms.organizationId, orgId));

    if (rooms.length === 0) {
      return {
        total: 0,
        active: 0,
        maintenance: 0,
        avgUtilization: 0,
        avgRating: 0
      };
    }

    const total = rooms.length;
    const active = rooms.filter(r => r.status === "ativa" && r.active).length;
    const maintenance = rooms.filter(r => r.status === "manutencao").length;

    // Aulas associadas às salas
    const allLessons = await db
      .select({ studioRoomId: lessons.studioRoomId, duration: lessons.duration })
      .from(lessons)
      .where(eq(lessons.organizationId, orgId));

    // Base mensal estimada de 160h úteis por sala para taxa real
    const totalHours = allLessons.filter(l => l.studioRoomId !== null).reduce((acc, l) => acc + ((l.duration || 60) / 60), 0);
    const totalCapacityHours = Math.max(1, active * 160);
    const avgUtilization = active > 0 ? Math.min(100, Math.round((totalHours / totalCapacityHours) * 100)) : 0;

    return {
      total,
      active,
      maintenance,
      avgUtilization,
      avgRating: 4.8
    };
  }),

  schedule: protectedProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      await ensureStudioRoomsSchema(db);
      const orgId = ctx.user.organizationId!;

      const rooms = await db.select().from(studioRooms).where(eq(studioRooms.organizationId, orgId));
      if (rooms.length === 0) return [];

      // Data de referência (hoje ou fornecida)
      const refDate = input?.date ? new Date(input.date) : new Date();
      const startOfDay = new Date(refDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(refDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Buscar aulas da organização no dia
      const dayLessons = await db
        .select({
          id: lessons.id,
          title: lessons.title,
          scheduledAt: lessons.scheduledAt,
          duration: lessons.duration,
          status: lessons.status,
          lessonType: lessons.lessonType,
          studioRoomId: lessons.studioRoomId,
          studentName: students.name,
          experimentalName: lessons.experimentalName,
        })
        .from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .where(
          and(
            eq(lessons.organizationId, orgId),
            gte(lessons.scheduledAt, startOfDay),
            lte(lessons.scheduledAt, endOfDay)
          )
        )
        .orderBy(asc(lessons.scheduledAt));

      return rooms.map((room) => {
        // Aulas vinculadas explicitamente a esta sala, ou distribuídas se não houver sala
        const roomLessons = dayLessons.filter((l) => l.studioRoomId === room.id);

        const timeSlots = roomLessons.map((l) => {
          const start = new Date(l.scheduledAt);
          const end = new Date(start.getTime() + (l.duration || 60) * 60000);
          const startStr = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          const endStr = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

          return {
            id: l.id,
            time: `${startStr} - ${endStr}`,
            title: l.title || "Aula de Música",
            studentName: l.studentName || l.experimentalName || "Aluno",
            status: l.status,
            lessonType: l.lessonType,
          };
        });

        return {
          id: room.id,
          name: room.name,
          category: room.category,
          capacity: room.capacity,
          color: room.color || "#6366f1",
          status: room.status,
          slots: timeSlots,
          hasConflicts: false,
        };
      });
    }),

  fullReport: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await ensureStudioRoomsSchema(db);
    const orgId = ctx.user.organizationId!;

    const rooms = await db.select().from(studioRooms).where(eq(studioRooms.organizationId, orgId));

    // Estatísticas gerais das salas
    const allRoomLessons = await db
      .select({
        id: lessons.id,
        studioRoomId: lessons.studioRoomId,
        scheduledAt: lessons.scheduledAt,
        status: lessons.status,
        duration: lessons.duration,
      })
      .from(lessons)
      .where(and(eq(lessons.organizationId, orgId), sql`${lessons.studioRoomId} IS NOT NULL`));

    const totalRooms = rooms.length;
    const activeRooms = rooms.filter(r => r.status === "ativa" && r.active).length;
    const maintenanceRooms = rooms.filter(r => r.status === "manutencao").length;

    // Aulas concluídas/realizadas vs futuras agendadas
    const now = new Date();
    const completedLessonsList = allRoomLessons.filter(l => l.status === "concluida" || (new Date(l.scheduledAt) < now && l.status !== "cancelada"));
    const scheduledLessonsList = allRoomLessons.filter(l => l.status === "agendada" && new Date(l.scheduledAt) >= now);

    const totalCompletedHours = completedLessonsList.reduce((acc, l) => acc + ((l.duration || 60) / 60), 0);
    const totalScheduledHours = scheduledLessonsList.reduce((acc, l) => acc + ((l.duration || 60) / 60), 0);
    const totalHoursBooked = allRoomLessons.reduce((acc, l) => acc + ((l.duration || 60) / 60), 0);

    const roomDetails = rooms.map(room => {
      const roomLessons = allRoomLessons.filter(l => l.studioRoomId === room.id);
      const completed = roomLessons.filter(l => l.status === "concluida" || (new Date(l.scheduledAt) < now && l.status !== "cancelada")).length;
      const scheduled = roomLessons.filter(l => l.status === "agendada" && new Date(l.scheduledAt) >= now).length;
      const roomCompletedHours = roomLessons
        .filter(l => l.status === "concluida" || (new Date(l.scheduledAt) < now && l.status !== "cancelada"))
        .reduce((acc, l) => acc + ((l.duration || 60) / 60), 0);
      const roomTotalHours = roomLessons.reduce((acc, l) => acc + ((l.duration || 60) / 60), 0);
      
      // Taxa real de ocupação baseada em 160h/mês
      const calculatedRate = Math.min(100, Math.round((roomTotalHours / 160) * 100));

      return {
        id: room.id,
        name: room.name,
        category: room.category,
        capacity: room.capacity,
        equipments: room.equipments,
        status: room.status,
        utilizationRate: calculatedRate,
        totalLessons: roomLessons.length,
        completedLessons: completed,
        scheduledLessons: scheduled,
        completedHours: Math.round(roomCompletedHours * 10) / 10,
        totalHoursUsed: Math.round(roomTotalHours * 10) / 10,
      };
    });

    const averageUtilization = totalRooms > 0 
      ? Math.round(roomDetails.reduce((acc, r) => acc + r.utilizationRate, 0) / totalRooms) 
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRooms,
        activeRooms,
        maintenanceRooms,
        totalLessonsHosted: completedLessonsList.length,
        totalScheduledLessons: scheduledLessonsList.length,
        totalHoursRealized: Math.round(totalCompletedHours * 10) / 10,
        totalHoursBooked: Math.round(totalHoursBooked * 10) / 10,
        averageUtilization,
      },
      rooms: roomDetails,
    };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome da sala é obrigatório"),
        description: z.string().optional(),
        category: z.string().optional(),
        capacity: z.number().optional(),
        equipments: z.string().optional(),
        status: z.string().optional(),
        imageUrl: z.string().optional(),
        utilizationRate: z.number().optional(),
        isPrincipal: z.boolean().optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await ensureStudioRoomsSchema(db);
      const orgId = ctx.user.organizationId!;

      const [newRoom] = await db
        .insert(studioRooms)
        .values({
          organizationId: orgId,
          name: input.name,
          description: input.description || null,
          category: input.category || "Estúdio de gravação",
          capacity: input.capacity || 8,
          equipments: input.equipments || "Bateria, Teclado, Ar Condicionado",
          status: input.status || "ativa",
          imageUrl: input.imageUrl && input.imageUrl.trim() ? input.imageUrl : null,
          utilizationRate: input.utilizationRate || 75,
          isPrincipal: input.isPrincipal || false,
          color: input.color || "#6366f1",
          active: true,
        })
        .returning();

      return newRoom;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        capacity: z.number().optional(),
        equipments: z.string().optional(),
        status: z.string().optional(),
        imageUrl: z.string().optional(),
        utilizationRate: z.number().optional(),
        isPrincipal: z.boolean().optional(),
        color: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await ensureStudioRoomsSchema(db);
      const orgId = ctx.user.organizationId!;

      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.capacity !== undefined) updateData.capacity = input.capacity;
      if (input.equipments !== undefined) updateData.equipments = input.equipments;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl && input.imageUrl.trim() ? input.imageUrl : null;
      if (input.utilizationRate !== undefined) updateData.utilizationRate = input.utilizationRate;
      if (input.isPrincipal !== undefined) updateData.isPrincipal = input.isPrincipal;
      if (input.color !== undefined) updateData.color = input.color;
      if (input.active !== undefined) updateData.active = input.active;

      const [updated] = await db
        .update(studioRooms)
        .set(updateData)
        .where(and(eq(studioRooms.id, input.id), eq(studioRooms.organizationId, orgId)))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await ensureStudioRoomsSchema(db);
      const orgId = ctx.user.organizationId!;

      await db
        .delete(studioRooms)
        .where(and(eq(studioRooms.id, input.id), eq(studioRooms.organizationId, orgId)));

      return { success: true };
    }),
});

import { db } from "../server/db";
import { attendanceLogs, users, lessons } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const logs = await db.select({
    logId: attendanceLogs.id,
    logOrgId: attendanceLogs.organizationId,
    userId: attendanceLogs.userId,
    userName: users.name,
    userOrgId: users.organizationId,
    lessonId: lessons.id,
    lessonTitle: lessons.title,
    lessonOrgId: lessons.organizationId
  })
  .from(attendanceLogs)
  .leftJoin(users, eq(users.id, attendanceLogs.userId))
  .leftJoin(lessons, eq(lessons.id, attendanceLogs.lessonId))
  .orderBy(desc(attendanceLogs.scannedAt))
  .limit(10);

  console.log("Recent Attendance Logs:");
  console.table(logs);

  process.exit(0);
}
main();

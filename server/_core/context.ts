import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  impersonatorAdminId?: number;
  impersonatorAdminName?: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let impersonatorAdminId: number | undefined = undefined;
  let impersonatorAdminName: string | undefined = undefined;

  try {
    const cookies = sdk.parseCookies(opts.req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await sdk.verifySession(sessionCookie);

    if (session) {
      impersonatorAdminId = session.impersonatorAdminId;
      impersonatorAdminName = session.impersonatorAdminName;
    }

    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    impersonatorAdminId,
    impersonatorAdminName,
  };
}

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
export async function proxy(request: NextRequest) {
  try { return await updateSession(request); } catch { return; }
}
export const config = { matcher: ["/app/:path*", "/login", "/register"] };

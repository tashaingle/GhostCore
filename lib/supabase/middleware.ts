import {createServerClient} from "@supabase/ssr";
import {NextResponse, type NextRequest} from "next/server";
import type {Database} from "@/types/database";
import {getSupabaseEnv} from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({request});
  const {url, key} = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({name, value}) => request.cookies.set(name, value));
        response = NextResponse.next({request});
        values.forEach(({name, value, options}) => response.cookies.set(name, value, options));
      },
    },
  });
  const {data} = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub);
  const pathname = request.nextUrl.pathname;
  if (!signedIn && pathname.startsWith("/app"))
    return NextResponse.redirect(new URL("/login", request.url));
  if (signedIn && (pathname === "/login" || pathname === "/register"))
    return NextResponse.redirect(new URL("/app", request.url));
  return response;
}

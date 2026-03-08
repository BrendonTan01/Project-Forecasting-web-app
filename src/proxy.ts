import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isStaffBlockedRoute } from "@/lib/permissions";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/proposals",
  "/staff",
  "/capacity",
  "/capacity-planner",
  "/forecast",
  "/time-entry",
  "/alerts",
  "/settings",
  "/leave",
  "/admin",
];

const AUTH_ONLY_ROUTES = ["/login", "/signup"];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

function isAuthOnlyRoute(pathname: string): boolean {
  return AUTH_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next({ request });
  }

  const supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session before checking redirects.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated user trying to access a protected route -> redirect to /login.
  if (!user && isProtectedRoute(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user visiting /login or /signup -> redirect to /dashboard.
  if (user && isAuthOnlyRoute(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Role-based route guard: staff cannot access proposals or capacity routes.
  // The DB query only runs when the authenticated user hits one of these restricted paths.
  if (user && isStaffBlockedRoute(pathname)) {
    const { data: dbUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (dbUser?.role === "staff") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     * This is the recommended pattern from the Supabase SSR docs.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

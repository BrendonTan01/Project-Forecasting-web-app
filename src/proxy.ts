import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that require authentication
const protectedPaths = [
  "/dashboard",
  "/projects",
  "/staff",
  "/capacity",
  "/time-entry",
  "/alerts",
  "/settings",
];

// Routes only for unauthenticated users
const authPaths = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = await updateSession(request);

  // Check if path is protected
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  if (isProtected || isAuthPath) {
    // Auth middleware will have refreshed the session
    // We need to check auth in the route handlers or use a different approach
    // For now, updateSession handles cookie refresh - actual redirect happens in layout
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

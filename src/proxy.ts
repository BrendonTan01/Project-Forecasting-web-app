import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/proposals/:path*",
    "/staff/:path*",
    "/capacity/:path*",
    "/time-entry/:path*",
    "/alerts/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
  ],
};

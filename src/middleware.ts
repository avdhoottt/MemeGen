import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/login", "/api/auth", "/api/memes"];

// CORS headers for API routes
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Handle OPTIONS preflight requests for API routes
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return NextResponse.json({}, { headers: corsHeaders });
  }

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route),
  );

  // Allow public routes with CORS headers for API
  if (isPublicRoute) {
    const response = NextResponse.next();
    if (pathname.startsWith("/api/")) {
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }
    return response;
  }

  // Check authentication
  const isAuthenticated = !!req.auth;

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // For API routes, return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // For pages, redirect to login
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Add CORS headers for API routes
  const response = NextResponse.next();

  if (pathname.startsWith("/api/")) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
  }

  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

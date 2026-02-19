import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/", "/interview"];
const AUTH_PATHS = ["/sign-in", "/sign-up"];
const SESSION_COOKIE = "session";

function isProtectedPath(pathname: string) {
  if (pathname === "/") return true;
  return PROTECTED_PATHS.some(
    (path) => path !== "/" && pathname.startsWith(path)
  );
}

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((path) => pathname === path);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (isProtectedPath(pathname) && !hasSession) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthPath(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

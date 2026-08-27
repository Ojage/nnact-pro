/** Routes that must render without the authenticated staff shell. */
export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === "/login" ||
    pathname === "/welcome" ||
    pathname.startsWith("/welcome/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/p" ||
    pathname.startsWith("/p/")
  );
}

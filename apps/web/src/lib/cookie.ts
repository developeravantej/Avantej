// Cookie utility for client-side only (no SSR)
// TODO: Adapt for Better-Auth cookie handling if needed

export function getCookieHeader() {
  // Client-side only: Use document.cookie
  if (typeof window === "undefined") {
    return {
      Cookie: undefined,
    };
  }

  const cookieHeader = document.cookie;

  return {
    Cookie: cookieHeader,
  };
}





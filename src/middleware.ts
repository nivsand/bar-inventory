export { default } from "next-auth/middleware";
export const config = {
  matcher: [
    "/dashboard/:path*", "/inventory/:path*", "/suppliers/:path*", "/count/:path*",
    "/orders/:path*", "/prep/:path*", "/deliveries/:path*", "/waste/:path*",
    "/reports/:path*", "/users/:path*", "/settings/:path*", "/account/:path*",
  ],
};

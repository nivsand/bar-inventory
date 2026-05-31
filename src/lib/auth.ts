import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale } as any;
      },
    }),
  ],
  callbacks: {
    // Keep redirects same-origin and prefer relative paths so logout/login never
    // bounce to a wrong host or port.
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        /* ignore malformed url */
      }
      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) { token.role = (user as any).role; token.locale = (user as any).locale; token.uid = (user as any).id; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid;
        (session.user as any).role = token.role;
        (session.user as any).locale = token.locale;
      }
      return session;
    },
  },
};

export const getSession = () => getServerSession(authOptions);

export type SessionUser = { id: string; name: string; email: string; role: Role; locale: string };

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session.user as unknown as SessionUser;
}

export function isManager(role?: Role) { return role === Role.MANAGER || role === Role.ADMIN; }
export function isAdmin(role?: Role) { return role === Role.ADMIN; }

export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isManager(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw new Error("FORBIDDEN");
  return user;
}

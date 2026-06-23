import { Role } from "@prisma/client";
export type Locale = "he" | "en";
declare module "next-auth" {
  interface Session { user: { id: string; name: string; email?: string | null; role: Role; locale: string } }
}

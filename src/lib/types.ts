import { Role } from "@prisma/client";
export type Locale = "he" | "en";
declare module "next-auth" {
  interface Session { user: { id: string; name: string; email: string; role: Role; locale: string } }
}

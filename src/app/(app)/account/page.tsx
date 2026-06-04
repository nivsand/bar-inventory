import { redirect } from "next/navigation";

// Account was merged into the Users screen. Keep this route as a redirect so any
// old bookmark/link still works.
export default function AccountRedirect() {
  redirect("/users");
}

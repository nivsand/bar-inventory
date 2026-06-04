import { redirect } from "next/navigation";

// Count history moved into the Daily Count screen (History tab). Keep this route
// as a redirect so any old bookmark/link still works.
export default function CountHistoryRedirect() {
  redirect("/count");
}

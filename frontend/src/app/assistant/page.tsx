import { redirect } from "next/navigation";

/** Assistant lives in the site-wide chat bubble — keep old URL friendly. */
export default function AssistantPage() {
  redirect("/");
}

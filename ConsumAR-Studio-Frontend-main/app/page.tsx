import { redirect } from "next/navigation";

export default function Home() {
  // Redirect everyone to the studio, which now serves as the main landing page/teaser for anonymous users
  redirect("/studio");
}
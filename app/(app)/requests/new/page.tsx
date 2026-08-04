import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { filesOwnRecords } from "@/lib/types";
import { RequestForm } from "./request-form";

export const metadata = { title: "New request — IRIS" };

export default async function NewRequestPage() {
  const profile = await requireProfile();

  // Hiding the button is not enough; the route has to refuse the role too.
  if (!filesOwnRecords(profile.role)) redirect("/requests");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/requests">
            <ArrowLeft className="h-4 w-4" />
            Requests
          </Link>
        </Button>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">New request</h1>
          <p className="text-sm text-muted-foreground">
            Ask for equipment, an office item, or support. Describe what you need
            and the form can fill in the rest.
          </p>
        </div>
      </div>

      <RequestForm userId={profile.id} />
    </div>
  );
}

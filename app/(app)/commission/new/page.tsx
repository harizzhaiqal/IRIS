import { CommissionUploadForm } from "@/components/commission/commission-upload-form";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Upload commission PDF — IRIS" };

export default async function NewCommissionPage() {
  await requireRole(["hr_admin"]);

  return <CommissionUploadForm />;
}

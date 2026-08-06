"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileUp, Info } from "lucide-react";

import { useCommission } from "@/components/commission/commission-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMMISSION_MONTHS,
  DEMO_COMMISSION_EMPLOYEES,
} from "@/lib/commission/demo-data";

const selectClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function CommissionUploadForm() {
  const router = useRouter();
  const { createRecord } = useCommission();
  const [employeeId, setEmployeeId] = useState(101);
  const [commissionMonth, setCommissionMonth] = useState(7);
  const [commissionYear, setCommissionYear] = useState(2026);
  const [pdfFileName, setPdfFileName] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const employee = DEMO_COMMISSION_EMPLOYEES.find(
      (entry) => entry.id === employeeId,
    );
    const attachmentName = pdfFileName.trim();

    if (!employee) {
      setError("Select a staff member.");
      return;
    }
    if (!attachmentName) {
      setError("Choose a PDF or enter an attachment name.");
      return;
    }
    if (!attachmentName.toLowerCase().endsWith(".pdf")) {
      setError("The attachment name must end in .pdf.");
      return;
    }

    const id = createRecord({
      employee,
      commissionMonth,
      commissionYear,
      pdfFileName: attachmentName,
    });
    router.push(`/commission/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload commission PDF
        </h1>
        <p className="text-sm text-muted-foreground">
          Add a commission statement to the prototype register for one staff member.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Prototype upload</AlertTitle>
        <AlertDescription>
          The file name and workflow are saved in browser state. No document is sent
          to external storage.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Commission record</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="commissionEmployee">Staff member</Label>
                <select
                  id="commissionEmployee"
                  className={selectClassName}
                  value={employeeId}
                  onChange={(event) => setEmployeeId(Number(event.target.value))}
                >
                  {DEMO_COMMISSION_EMPLOYEES.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} — {employee.department}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commissionMonth">Commission month</Label>
                <select
                  id="commissionMonth"
                  className={selectClassName}
                  value={commissionMonth}
                  onChange={(event) => setCommissionMonth(Number(event.target.value))}
                >
                  {COMMISSION_MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commissionYear">Commission year</Label>
                <Input
                  id="commissionYear"
                  type="number"
                  min={2024}
                  max={2030}
                  value={commissionYear}
                  onChange={(event) => setCommissionYear(Number(event.target.value))}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="commissionFile">Choose PDF for demo</Label>
                <Input
                  id="commissionFile"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setPdfFileName(file.name);
                      setError("");
                    }
                  }}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="commissionFileName">
                  Attachment name
                </Label>
                <Input
                  id="commissionFileName"
                  value={pdfFileName}
                  onChange={(event) => {
                    setPdfFileName(event.target.value);
                    setError("");
                  }}
                  placeholder="Commission_Employee_July_2026.pdf"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  You can enter a realistic PDF name without selecting a local file.
                </p>
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <Link href="/commission">Cancel</Link>
              </Button>
              <Button type="submit">
                <FileUp className="h-4 w-4" />
                Save uploaded record
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

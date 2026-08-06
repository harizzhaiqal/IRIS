"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  FileDown,
  Search,
  UserRoundSearch,
  Users,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { minutesToHHMM } from "@/lib/utils/duration";

const ALL_DEPARTMENTS = "all";

export type StaffTrainingDirectoryRow = {
  id: number;
  fullName: string;
  email: string;
  designation: string | null;
  departmentId: number | null;
  departmentName: string | null;
  trainingCount: number;
  totalMinutes: number;
  detailHref: string;
  exportHref: string;
  verifyHref?: string | null;
};

export function StaffTrainingDirectory({
  rows,
  departments,
  year,
  years,
  bulkExportHref,
  showVerifyAction = false,
}: {
  rows: StaffTrainingDirectoryRow[];
  departments: { id: number; name: string }[];
  year: number;
  years: number[];
  bulkExportHref?: string;
  showVerifyAction?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState(ALL_DEPARTMENTS);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesDepartment =
          department === ALL_DEPARTMENTS ||
          row.departmentId === Number(department);
        const matchesSearch =
          normalizedSearch.length === 0 ||
          [row.fullName, row.email, row.designation, row.departmentName]
            .filter(Boolean)
            .some((value) =>
              value!.toLocaleLowerCase().includes(normalizedSearch),
            );

        return matchesDepartment && matchesSearch;
      }),
    [department, normalizedSearch, rows],
  );
  const hasFilters =
    normalizedSearch.length > 0 || department !== ALL_DEPARTMENTS;

  function changeYear(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", value);
    router.push(`/training/submissions?${params.toString()}`);
  }

  function clearFilters() {
    setSearch("");
    setDepartment(ALL_DEPARTMENTS);
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>
            {filteredRows.length} {filteredRows.length === 1 ? "staff member" : "staff members"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Training totals shown for {year}.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Year</Label>
            <Select value={String(year)} onValueChange={changeYear}>
              <SelectTrigger className="w-[120px]" aria-label="Training year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {bulkExportHref ? (
            <Button variant="success" asChild>
              <a href={bulkExportHref}>
                <FileDown className="h-4 w-4" />
                Download all — {year}
              </a>
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-3">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label htmlFor="staff-training-search" className="text-xs text-muted-foreground">
              Search staff
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="staff-training-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, designation, or department"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-[210px]" aria-label="Department filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPARTMENTS}>All departments</SelectItem>
                {departments.map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={rows.length === 0 ? "No active staff" : "No staff found"}
            description={
              rows.length === 0
                ? "Active staff and their training totals will appear here."
                : "Try another name, email, designation, or department."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Total training</TableHead>
                <TableHead className="text-right">Total hours</TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.designation ?? "No designation"}
                    </p>
                  </TableCell>
                  <TableCell>{row.departmentName ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {row.trainingCount}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {minutesToHHMM(row.totalMinutes)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-2">
                      {showVerifyAction ? (
                        row.verifyHref ? (
                          <Button variant="success" size="sm" asChild>
                            <Link href={row.verifyHref}>
                              <CheckCircle2 className="h-4 w-4" />
                              Verify
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            disabled
                            title="No submissions are awaiting your verification."
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Verify
                          </Button>
                        )
                      ) : null}
                      <Button
                        size="sm"
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        asChild
                      >
                        <Link href={row.detailHref}>
                          <UserRoundSearch className="h-4 w-4" />
                          View
                        </Link>
                      </Button>
                      <Button
                        variant={showVerifyAction ? "default" : "success"}
                        size="sm"
                        className={
                          showVerifyAction
                            ? "bg-violet-600 text-white hover:bg-violet-700"
                            : undefined
                        }
                        asChild
                      >
                        <a href={row.exportHref}>
                          <FileDown className="h-4 w-4" />
                          Download report
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

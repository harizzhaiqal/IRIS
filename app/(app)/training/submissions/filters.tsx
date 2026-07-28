"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, type SubmissionStatus } from "@/lib/types";
import { MONTH_NAMES } from "@/lib/utils/targets";

const ALL = "all";

const STATUSES = Object.keys(STATUS_LABELS) as SubmissionStatus[];

export function SubmissionFilters({
  month,
  year,
  departmentId,
  status,
  employeeId,
  years,
  departments,
  employees,
}: {
  month: number | null;
  year: number | null;
  departmentId: string | null;
  status: SubmissionStatus | null;
  employeeId: string | null;
  years: number[];
  departments: { id: string; name: string }[];
  employees: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.push(`/training/submissions?${params.toString()}`);
  }

  const hasFilters =
    month !== null ||
    year !== null ||
    departmentId !== null ||
    status !== null ||
    employeeId !== null;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Month</Label>
        <Select
          value={month ? String(month) : ALL}
          onValueChange={(value) => setParam("month", value)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All months</SelectItem>
            {MONTH_NAMES.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Year</Label>
        <Select
          value={year ? String(year) : ALL}
          onValueChange={(value) => setParam("year", value)}
        >
          <SelectTrigger className="w-[110px]">
            <SelectValue placeholder="All years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All years</SelectItem>
            {years.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Department</Label>
        <Select
          value={departmentId ?? ALL}
          onValueChange={(value) => setParam("department", value)}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) => setParam("status", value)}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Employee</Label>
        <Select
          value={employeeId ?? ALL}
          onValueChange={(value) => setParam("employee", value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All employees</SelectItem>
            {employees.map((employee) => (
              <SelectItem key={employee.id} value={employee.id}>
                {employee.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/training/submissions")}
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

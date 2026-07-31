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
import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_CATEGORY_ORDER,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_ORDER,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_ORDER,
  type RequestCategory,
  type RequestPriority,
  type RequestStatus,
} from "@/lib/types";

const ALL = "all";

export function RequestFilters({
  status,
  category,
  priority,
  requesterId,
  department,
  requesters,
  departments,
}: {
  status: RequestStatus | null;
  category: RequestCategory | null;
  priority: RequestPriority | null;
  requesterId: number | null;
  department: string | null;
  requesters: { id: number; full_name: string }[];
  departments: string[];
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

    router.push(`/requests?${params.toString()}`);
  }

  const hasFilters =
    status !== null ||
    category !== null ||
    priority !== null ||
    requesterId !== null ||
    department !== null;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[10rem] flex-1 space-y-1.5">
        <Label htmlFor="filter-status">Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) => setParam("status", value)}
        >
          <SelectTrigger id="filter-status">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {REQUEST_STATUS_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {REQUEST_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[10rem] flex-1 space-y-1.5">
        <Label htmlFor="filter-category">Category</Label>
        <Select
          value={category ?? ALL}
          onValueChange={(value) => setParam("category", value)}
        >
          <SelectTrigger id="filter-category">
            <SelectValue placeholder="Any category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any category</SelectItem>
            {REQUEST_CATEGORY_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {REQUEST_CATEGORY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[9rem] flex-1 space-y-1.5">
        <Label htmlFor="filter-priority">Priority</Label>
        <Select
          value={priority ?? ALL}
          onValueChange={(value) => setParam("priority", value)}
        >
          <SelectTrigger id="filter-priority">
            <SelectValue placeholder="Any priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any priority</SelectItem>
            {REQUEST_PRIORITY_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {REQUEST_PRIORITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {departments.length > 0 ? (
        <div className="min-w-[9rem] flex-1 space-y-1.5">
          <Label htmlFor="filter-department">Department</Label>
          <Select
            value={department ?? ALL}
            onValueChange={(value) => setParam("department", value)}
          >
            <SelectTrigger id="filter-department">
              <SelectValue placeholder="Any department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any department</SelectItem>
              {departments.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {requesters.length > 1 ? (
        <div className="min-w-[11rem] flex-1 space-y-1.5">
          <Label htmlFor="filter-requester">Requester</Label>
          <Select
            value={requesterId ? String(requesterId) : ALL}
            onValueChange={(value) => setParam("requester", value)}
          >
            <SelectTrigger id="filter-requester">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {requesters.map((person) => (
                <SelectItem key={person.id} value={String(person.id)}>
                  {person.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push("/requests")}>
          <X className="h-4 w-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

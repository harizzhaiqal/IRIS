"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONTH_NAMES } from "@/lib/utils/targets";

export function MonthPicker({
  month,
  year,
  years,
  basePath = "/training",
}: {
  month: number;
  year: number;
  years: number[];
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(nextMonth: number, nextYear: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(nextMonth));
    params.set("year", String(nextYear));
    router.push(`${basePath}?${params.toString()}`);
  }

  function step(delta: number) {
    const index = month - 1 + delta;
    const nextYear = year + Math.floor(index / 12);
    const nextMonth = ((index % 12) + 12) % 12 + 1;
    go(nextMonth, nextYear);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => step(-1)}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Select
        value={String(month)}
        onValueChange={(value) => go(Number(value), year)}
      >
        <SelectTrigger className="w-[150px]" aria-label="Month">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES.map((name, index) => (
            <SelectItem key={name} value={String(index + 1)}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(year)}
        onValueChange={(value) => go(month, Number(value))}
      >
        <SelectTrigger className="w-[100px]" aria-label="Year">
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

      <Button
        variant="outline"
        size="icon"
        onClick={() => step(1)}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

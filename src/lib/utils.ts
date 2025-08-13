import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateCompletionPercentage(
  total: number,
  completed: number
) {
  return Math.round((completed / total) * 100);
}

/**
 * Formats a date to show only date and time (without seconds/milliseconds)
 * @param date - Date string or Date object
 * @returns Formatted date string in format: "MM/DD/YYYY, HH:MM AM/PM"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return "-";

  return dateObj.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

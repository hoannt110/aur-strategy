import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let scheduleInstanceTimeout: NodeJS.Timeout;

export function schedule(timestamp: number, fn: any) {
  const delay = timestamp - Date.now();
  if (delay <= 0) return null;

  scheduleInstanceTimeout = setTimeout(fn, delay);
}

export function cancelSchedule() {
  if (scheduleInstanceTimeout) {
    clearTimeout(scheduleInstanceTimeout);
  }
}

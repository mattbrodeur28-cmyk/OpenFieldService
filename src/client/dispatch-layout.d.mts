export function minuteOf(time: string): number;
export function clockOf(minute: number): string;
export function snapMinute(minute: number, interval: number): number;
export function shiftDate(date: string, days: number): string;
export function dayInZone(timeZone: string, instant?: Date): string;
export function layoutAppointments<
  T extends { id: string; scheduled_time: string; duration: number },
>(jobs: T[]): { items: { job: T; lane: number }[]; lanes: number };
export function overlapIds(
  jobs: {
    id: string;
    technician_id: string | null;
    status: string;
    scheduled_date: string;
    scheduled_time: string;
    duration: number;
  }[],
): Set<string>;

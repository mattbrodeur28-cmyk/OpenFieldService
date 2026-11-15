export interface Vehicle {
  id: string;
  location_id: string;
  location_name: string;
  location_version: number;
  fleet_number: string;
  vin: string;
  plate: string;
  make: string;
  model: string;
  model_year: number | null;
  status: "active" | "out_of_service" | "retired";
  distance_unit: "mi" | "km";
  odometer_tenths: number;
  version: number;
  technician_id: string | null;
  technician_name: string | null;
  maintenance?: Maintenance[];
}
export interface Maintenance {
  id: string;
  vehicle_id: string;
  title: string;
  due_date: string | null;
  due_odometer_tenths: number | null;
  interval_days: number | null;
  interval_distance_tenths: number | null;
  warning_days: number;
  warning_distance_tenths: number;
  active: number;
  version: number;
  reminder_status: "inactive" | "overdue" | "due" | "upcoming";
}
export interface FleetList {
  canManage: boolean;
  today: string;
  vehicles: Vehicle[];
}
export interface FleetDetail {
  vehicle: Vehicle;
  maintenance: Maintenance[];
  canManage: boolean;
  page: number;
  hasMoreHistory: boolean;
  history: {
    id: string;
    plan_id: string;
    service_date: string;
    odometer_tenths: number;
    cost_cents: number;
    notes: string;
  }[];
}
export const distanceLabel = (tenths: number, unit: string) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    tenths / 10,
  ) +
  " " +
  unit;

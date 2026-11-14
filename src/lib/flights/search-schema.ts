import { z } from "zod";
import { CABIN_CLASSES } from "./types";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: "Enter a 3-letter airport code" });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Select a date" })
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { message: "Select a date" },
  );

function todayInKazakhstan(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const flightSearchSchema = z
  .object({
    origin: iata,
    destination: iata,
    departureDate: isoDate,
    returnDate: z.union([isoDate, z.literal("")]).optional(),
    passengers: z.coerce
      .number({ invalid_type_error: "Enter a number" })
      .int()
      .min(1, { message: "At least 1 passenger" })
      .max(9, { message: "Maximum 9 passengers" }),
    cabinClass: z.enum(CABIN_CLASSES, { errorMap: () => ({ message: "Select a cabin class" }) }),
  })
  .refine((v) => v.departureDate >= todayInKazakhstan(), {
    path: ["departureDate"],
    message: "Departure date cannot be in the past",
  })
  .refine((v) => v.origin !== v.destination, {
    path: ["destination"],
    message: "Destination must differ from origin",
  })
  .refine((v) => !v.returnDate || v.returnDate >= v.departureDate, {
    path: ["returnDate"],
    message: "Return date must be on or after departure",
  });

export type FlightSearchInput = z.input<typeof flightSearchSchema>;

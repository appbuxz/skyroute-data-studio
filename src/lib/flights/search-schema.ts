import { z } from "zod";
import { CABIN_CLASSES } from "./types";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: "Enter a 3-letter airport code" });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Select a date" });

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
  .refine((v) => v.origin !== v.destination, {
    path: ["destination"],
    message: "Destination must differ from origin",
  })
  .refine((v) => !v.returnDate || v.returnDate >= v.departureDate, {
    path: ["returnDate"],
    message: "Return date must be on or after departure",
  });

export type FlightSearchInput = z.input<typeof flightSearchSchema>;

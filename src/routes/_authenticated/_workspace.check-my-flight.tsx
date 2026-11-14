import { createFileRoute } from "@tanstack/react-router";
import { CheckMyFlightPage } from "@/components/flights/check-my-flight-page";

export const Route = createFileRoute("/_authenticated/_workspace/check-my-flight")({
  head: () => ({
    meta: [
      { title: "Check My Flight — Flight Analytics" },
      { name: "description", content: "Check cheaper flights against your travel requirements." },
    ],
  }),
  component: CheckMyFlightPage,
});

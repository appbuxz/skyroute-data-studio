import { describe, expect, it } from "vitest";
import { connectingOffer } from "@/test/fixtures/agency-analysis";
import { groupFlightSchedules } from "./schedule-groups";

describe("analytics schedule grouping", () => {
  it("groups all fare offers for one complete schedule regardless of price, currency or baggage", () => {
    const a = connectingOffer();
    const b = connectingOffer("b");
    b.price = { amount: 500, currency: "USD" };
    b.baggage = { checked: { pieces: 2 } };
    const groups = groupFlightSchedules([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.offers).toEqual([a, b]);
  });
  it.each([
    "origin",
    "destination",
    "carrier",
    "flightNumber",
    "departureAt",
    "arrivalAt",
  ] as const)("keeps different %s on an intermediate segment separate", (field) => {
    const a = connectingOffer();
    const b = connectingOffer("b");
    b.outbound!.segments[1]![field] += "-different";
    expect(groupFlightSchedules([a, b])).toHaveLength(2);
  });
  it("keeps different return itineraries separate", () => {
    const a = connectingOffer();
    const b = connectingOffer("b");
    a.inbound = { segments: [{ ...a.outbound!.segments[0]!, origin: "IST", destination: "ALA" }] };
    b.inbound = {
      segments: [{ ...a.inbound!.segments[0]!, arrivalAt: "2099-12-20T20:00:00+05:00" }],
    };
    expect(groupFlightSchedules([a, b])).toHaveLength(2);
    expect(groupFlightSchedules([a, structuredClone(a)])).toHaveLength(1);
  });
  it("does not merge connecting offers when segment identities are unavailable", () => {
    const a = connectingOffer();
    const b = connectingOffer("b");
    delete a.outbound;
    delete b.outbound;
    expect(groupFlightSchedules([a, b])).toHaveLength(2);
  });
  it("groups identical direct summary flights but keeps different arrival airports separate", () => {
    const a = connectingOffer();
    delete a.outbound;
    a.stops = 0;
    const b = { ...a, id: "b" };
    const c = { ...a, id: "c", destination: "SAW" };
    const groups = groupFlightSchedules([a, b, c]);
    expect(groups.map((g) => g.offers.length)).toEqual([2, 1]);
  });
});

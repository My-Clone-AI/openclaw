import { describe, expect, it } from "vitest";
import {
  areaQuery,
  cardUsedPercent,
  monthGrid,
  obligationTone,
  totalBooked,
  type Account,
  type Obligation,
} from "./finance-data.js";

const account = (patch: Partial<Account>): Account => ({
  id: "a",
  label: "a",
  alias_of: null,
  masked_id: null,
  entity: "owner",
  scope: "personal",
  connection: null,
  type: null,
  balances: [],
  state: "read",
  ...patch,
});

describe("nsvx finance data", () => {
  it("maps each area to the NSVX entity and scope", () => {
    expect(areaQuery("eni")).toEqual({ entity: "owner", scope: "eni" });
    expect(areaQuery("company")).toEqual({ entity: "fortune_comet", scope: "company" });
  });

  it("keeps an unread balance unknown instead of zero, and skips aliases and cards", () => {
    expect(totalBooked([account({ state: "unknown" })])).toBeNull();
    const eur = (amount: string) => [{ kind: "booked" as const, amount, currency: "EUR" }];
    expect(
      totalBooked([
        account({ id: "1", balances: eur("100.50") }),
        account({ id: "2", balances: eur("-20.25") }),
        account({ id: "3", alias_of: "1", balances: eur("100.50") }),
        account({ id: "4", type: "CARD", balances: eur("-500") }),
      ]),
    ).toBe("80.25");
  });

  it("marks months with files, missing past months, and months still to come", () => {
    const grid = monthGrid({ months: [1], missing: [2] }, 2026, new Date(2026, 3, 10));
    expect(grid.slice(0, 5)).toEqual(["available", "missing", "pending", "pending", "future"]);
  });

  it("flags late and soon deadlines, and settles done ones", () => {
    const due = (effective_due: string, status = "por_preparar") =>
      obligationTone(
        { effective_due, status, certainty: "official" } as Obligation,
        new Date(2026, 10, 5),
      );
    expect(due("2026-11-01")).toBe("bad");
    expect(due("2026-11-10")).toBe("warn");
    expect(due("2026-12-31")).toBe("run");
    expect(due("2026-11-01", "pago")).toBe("ok");
  });

  it("reports card use only when NSVX knows the limit", () => {
    expect(cardUsedPercent({ used: "-250", credit_limit: "1000" })).toBe(25);
    expect(cardUsedPercent({ used: "250", credit_limit: null })).toBeNull();
  });
});

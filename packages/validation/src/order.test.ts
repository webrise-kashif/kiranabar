import { describe, expect, it } from "vitest";
import {
  checkoutSchema,
  orderQuerySchema,
  shippingAddressSchema,
  updateOrderStatusSchema,
} from "./order";

const VALID_ADDRESS = {
  recipientName: "Jane Doe",
  line1: "123 Main St",
  city: "Springfield",
  state: "IL",
  postalCode: "62704",
  country: "us",
};

describe("shippingAddressSchema", () => {
  it("accepts a minimal valid address and uppercases the country code", () => {
    const result = shippingAddressSchema.parse(VALID_ADDRESS);

    expect(result.country).toBe("US");
  });

  it("rejects a missing recipient name", () => {
    const { recipientName: _recipientName, ...rest } = VALID_ADDRESS;

    expect(() => shippingAddressSchema.parse(rest)).toThrow();
  });

  it("rejects a country code that is not exactly 2 letters", () => {
    expect(() => shippingAddressSchema.parse({ ...VALID_ADDRESS, country: "USA" })).toThrow();
  });

  it("accepts optional line2 and phone", () => {
    const result = shippingAddressSchema.parse({
      ...VALID_ADDRESS,
      line2: "Apt 4B",
      phone: "555-0100",
    });

    expect(result.line2).toBe("Apt 4B");
    expect(result.phone).toBe("555-0100");
  });
});

describe("checkoutSchema", () => {
  it("requires a shippingAddress", () => {
    expect(() => checkoutSchema.parse({})).toThrow();
  });

  it("accepts a valid checkout payload", () => {
    const result = checkoutSchema.parse({ shippingAddress: VALID_ADDRESS });

    expect(result.shippingAddress.city).toBe("Springfield");
  });
});

describe("orderQuerySchema", () => {
  it("defaults page/pageSize and allows an absent userId", () => {
    const result = orderQuerySchema.parse({});

    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it("accepts a valid userId", () => {
    const result = orderQuerySchema.parse({ userId: "01a05d22-3f6c-70f0-8cde-43b0772dd15b" });

    expect(result.userId).toBe("01a05d22-3f6c-70f0-8cde-43b0772dd15b");
  });

  it("rejects a userId that isn't a UUID", () => {
    expect(() => orderQuerySchema.parse({ userId: "not-a-uuid" })).toThrow();
  });
});

describe("updateOrderStatusSchema", () => {
  it.each(["PAID", "SHIPPED", "DELIVERED"])("accepts %s", (status) => {
    expect(updateOrderStatusSchema.parse({ status }).status).toBe(status);
  });

  it.each(["PLACED", "CANCELLED", "REFUNDED"])("rejects %s", (status) => {
    expect(() => updateOrderStatusSchema.parse({ status })).toThrow();
  });
});

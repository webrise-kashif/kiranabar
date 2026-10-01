import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the message", () => {
    render(<Toast message="Product created." onClose={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Product created.");
  });

  it("calls onClose when the dismiss button is clicked", () => {
    const onClose = vi.fn();
    render(<Toast message="Product created." onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose automatically after the auto-dismiss delay", () => {
    const onClose = vi.fn();
    render(<Toast message="Product created." onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

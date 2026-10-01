import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("disables Previous on the first page and Next on the last", () => {
    render(<Pagination page={1} pageSize={20} total={15} onPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByText("Page 1 of 1 (15 total)")).toBeInTheDocument();
  });

  it("enables Next when there are more pages, and calls onPageChange", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={20} total={45} onPageChange={onPageChange} />);
    const user = userEvent.setup();

    expect(screen.getByText("Page 1 of 3 (45 total)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("enables Previous once past the first page", () => {
    render(<Pagination page={2} pageSize={20} total={45} onPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });
});

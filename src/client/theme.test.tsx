import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

function Toggle() {
  const { theme, toggle } = useTheme();
  return <button onClick={toggle}>{theme}</button>;
}
describe("ThemeProvider", () => {
  it("alterna e persiste o tema", async () => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("encaixa-theme")).toBe("dark");
  });
});

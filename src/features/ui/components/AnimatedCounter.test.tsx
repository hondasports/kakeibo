import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedCounter } from "./AnimatedCounter";

let reducedMotion = false;

vi.mock("framer-motion", async (importOriginal) => {
  const mod = await importOriginal<typeof import("framer-motion")>();
  return {
    ...mod,
    useReducedMotion: () => reducedMotion,
  };
});

describe("AnimatedCounter", () => {
  beforeEach(() => {
    reducedMotion = false;
  });

  it("レンダリングすること", () => {
    render(<AnimatedCounter value={1234} />);

    const container = screen.getByText((_content, element) => {
      return element?.getAttribute("data-value") === "1,234";
    });
    expect(container).toBeInTheDocument();
  });

  it("prefixとsuffixを表示すること", () => {
    render(<AnimatedCounter value={500} prefix="¥" suffix="円" />);

    const container = screen.getByText((_content, element) => {
      return element?.getAttribute("data-value") === "¥500円";
    });
    expect(container).toHaveTextContent("¥");
    expect(container).toHaveTextContent("円");
  });

  it("ライブリージョンを持たないこと", () => {
    render(<AnimatedCounter value={100} />);

    expect(document.querySelector("[aria-live]")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-atomic]")).not.toBeInTheDocument();
  });

  it("reduced-motion環境では即座に最終値を表示すること", async () => {
    reducedMotion = true;
    render(<AnimatedCounter value={1234} suffix="円" />);

    expect(await screen.findByText("1,234")).toBeInTheDocument();
  });
});

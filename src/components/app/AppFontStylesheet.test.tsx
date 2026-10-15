import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFontStylesheet } from "./AppFontStylesheet";

describe("nonblocking existing typefaces", () => {
  it("keeps the CDN stylesheet outside screen rendering during SSR and a pending load", () => {
    expect(renderToString(<AppFontStylesheet />)).toContain('media="print"');
    const { container } = render(<AppFontStylesheet />);
    const stylesheet = container.querySelector("link")!;
    expect(stylesheet.media).toBe("print");
    fireEvent.load(stylesheet);
    expect(stylesheet.media).toBe("all");
    expect(stylesheet.href).toContain("family=Figtree");
    expect(stylesheet.href).toContain("Plus+Jakarta+Sans");
  });
  it("keeps system fallbacks when the remote stylesheet fails", () => {
    const { container } = render(<AppFontStylesheet />);
    const stylesheet = container.querySelector("link")!;
    fireEvent.error(stylesheet);
    expect(stylesheet.media).toBe("print");
  });
});

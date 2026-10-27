import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgendaClock } from "./AgendaClock";

describe("Agenda event clock", () => {
  it.each([
    ["09:00", 270, 0],
    ["10:00", 300, 0],
    ["14:00", 60, 0],
    ["10:30", 315, 180],
    ["00:00", 0, 0],
    ["23:59", 359.5, 354],
  ])("positions both hands for %s", (time, hourAngle, minuteAngle) => {
    const { container } = render(<AgendaClock time={time} />);
    expect(container.querySelector(".agenda-clock-hour")).toHaveAttribute(
      "transform",
      `rotate(${hourAngle} 12 12)`,
    );
    expect(container.querySelector(".agenda-clock-minute")).toHaveAttribute(
      "transform",
      `rotate(${minuteAngle} 12 12)`,
    );
  });

  it.each([undefined, null, "", "9:00", "24:00", "10:60", "10h30", "não definido"])(
    "does not invent a clock for an absent or invalid time: %s",
    (time) => {
      const { container } = render(<AgendaClock time={time} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("remains decorative beside the accessible HTML time", () => {
    const { container } = render(<AgendaClock time="09:00" className="event-time-icon" />);
    const clock = container.querySelector("svg");
    expect(clock).toHaveAttribute("aria-hidden", "true");
    expect(clock).toHaveAttribute("focusable", "false");
    expect(clock).not.toHaveAttribute("tabindex");
    expect(clock).toHaveClass("agenda-clock", "event-time-icon");
    expect(clock?.querySelector("title")).toBeNull();
  });
});

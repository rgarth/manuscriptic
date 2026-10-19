export type HintPlace = "above" | "below" | "right";

export type HintAnchor = {
  x: number;
  y: number;
  place: HintPlace;
};

export function hintAnchor(rect: {
  top: number;
  bottom: number;
  left: number;
  width: number;
}): HintAnchor {
  if (rect.left < 48) {
    return {
      x: rect.left + rect.width + 8,
      y: rect.top + (rect.bottom - rect.top) / 2,
      place: "right",
    };
  }
  const above = rect.top > 36;
  return {
    x: rect.left + rect.width / 2,
    y: above ? rect.top - 8 : rect.bottom + 8,
    place: above ? "above" : "below",
  };
}

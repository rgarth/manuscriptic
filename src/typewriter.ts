export function scrollTopForCaret(
  scrollTop: number,
  caretMiddle: number,
  viewTop: number,
  viewHeight: number,
): number {
  if (viewHeight <= 0) {
    return scrollTop;
  }
  return Math.max(0, scrollTop + (caretMiddle - (viewTop + viewHeight / 2)));
}

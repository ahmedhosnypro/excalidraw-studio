/**
 * Fits a generated (bounding-box-sized) Excalidraw export SVG into a
 * thumbnail host box and mounts it, replacing any previous preview.
 */
export function mountSvgPreview(svg: SVGSVGElement, host: HTMLElement): void {
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("style", "display:block");
  host.replaceChildren(svg);
}

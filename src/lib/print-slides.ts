"use client";

import { exportToSvg } from "@excalidraw/excalidraw";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { PresentationSlide } from "@/store/editor-store";

const CONTAINER_ID = "slides-print-root";
const BODY_CLASS = "printing-slides";

/**
 * Prints the presentation slides one-per-page (landscape, zero margins) so
 * the browser's "Save as PDF" produces a slide deck. Builds a hidden print
 * container with an SVG per slide, prints, then cleans up.
 */
export async function printSlides(
  slides: PresentationSlide[],
  files: BinaryFiles,
  darkMode: boolean,
): Promise<void> {
  if (slides.length === 0 || typeof window === "undefined") {
    return;
  }

  // Remove leftovers from a previous (interrupted) run.
  document.getElementById(CONTAINER_ID)?.remove();

  const container = document.createElement("div");
  container.id = CONTAINER_ID;

  const style = document.createElement("style");
  style.id = `${CONTAINER_ID}-style`;
  style.textContent = `
    #${CONTAINER_ID} { display: none; }
    @media print {
      @page { size: landscape; margin: 0; }
      body.${BODY_CLASS} > *:not(#${CONTAINER_ID}) { display: none; }
      body.${BODY_CLASS} #${CONTAINER_ID} { display: block; }
      #${CONTAINER_ID} .slide-page {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100vw;
        height: 100vh;
        break-after: page;
      }
      #${CONTAINER_ID} .slide-page:last-child { break-after: auto; }
      #${CONTAINER_ID} .slide-art {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 92vw;
        height: 88vh;
      }
      #${CONTAINER_ID} .slide-art svg { max-width: 100%; max-height: 100%; }
    }
  `;

  for (const slide of slides) {
    const page = document.createElement("div");
    page.className = "slide-page";
    if (slide.elements.length > 0) {
      const svg = await exportToSvg({
        elements: slide.elements as never,
        appState: {
          exportBackground: false,
          exportWithDarkMode: darkMode,
          exportingFrame: slide.frame ?? null,
        },
        files,
        exportPadding: 24,
      });
      const art = document.createElement("div");
      art.className = "slide-art";
      art.append(svg);
      page.append(art);
    }
    container.append(page);
  }

  document.body.append(style, container);
  document.body.classList.add(BODY_CLASS);

  const cleanup = (): void => {
    document.body.classList.remove(BODY_CLASS);
    container.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Safety net: if afterprint never fires (interrupted dialog), clean up later.
  window.setTimeout(cleanup, 120_000);

  window.print();
}

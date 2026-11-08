import { useLayoutEffect, useRef } from 'react';
import { useAnimate, useReducedMotion } from 'motion/react';
import type { PreviewSource } from './FileRow';

const spring = { type: 'spring', bounce: 0, duration: 0.34 } as const;
const fileExit = {
  duration: 0.16,
  ease: [0.22, 0.61, 0.36, 1],
} as const;
const fade = { duration: 0.14 };
const fileFade = { duration: 0.12 };

function sourceTransform(
  anchor: HTMLElement,
  panel: HTMLElement,
  media: boolean,
) {
  const origin = anchor.getBoundingClientRect();
  const widthScale = Math.max(0.02, origin.width / panel.offsetWidth);
  const heightScale = Math.max(0.02, origin.height / panel.offsetHeight);
  const scale = Math.min(widthScale, heightScale);
  return {
    x:
      origin.left + origin.width / 2 - panel.offsetLeft - panel.offsetWidth / 2,
    y:
      origin.top + origin.height / 2 - panel.offsetTop - panel.offsetHeight / 2,
    scaleX: media ? widthScale : scale,
    scaleY: media ? heightScale : scale,
  };
}

export function usePeekDialog(
  source: PreviewSource,
  anchor: HTMLElement,
  media: boolean,
  close: () => void,
) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const openedAsMedia = useRef(media);
  const [panel, animate] = useAnimate<HTMLDivElement>();
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const element = dialog.current;
    const surface = panel.current;
    if (!element || !surface) return;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (scrim.current) void animate(scrim.current, { opacity: 1 }, fade);

    const openingMedia = openedAsMedia.current;
    if (reducedMotion) {
      if (openingMedia) void animate(surface, { opacity: 1 }, fade);
    } else {
      const from = sourceTransform(anchor, surface, openingMedia);
      if (!openingMedia) {
        // position the glass at the icon before the first paint.
        surface.style.setProperty(
          'transform',
          `translate(${from.x}px, ${from.y}px) scale(${from.scaleX})`,
        );
      }
      void animate(
        surface,
        {
          x: [from.x, 0],
          y: [from.y, 0],
          scaleX: [from.scaleX, 1],
          scaleY: [from.scaleY, 1],
          ...(openingMedia ? { opacity: [0.5, 1] } : {}),
        },
        spring,
      );
    }
    return () => {
      source.trigger.setAttribute('data-peek-restored-focus', '');
      element.close();
      document.body.style.overflow = previousOverflow;
      source.trigger.focus({ preventScroll: true });
    };
  }, [anchor, animate, panel, reducedMotion, source.trigger]);

  function dismiss() {
    if (closing.current) return;
    closing.current = true;
    const surface = panel.current;
    if (!surface) {
      close();
      return;
    }
    const fadeOut = media ? fade : fileFade;
    if (scrim.current) void animate(scrim.current, { opacity: 0 }, fadeOut);
    const shrink = !reducedMotion && anchor.isConnected;
    const target = shrink
      ? { ...sourceTransform(anchor, surface, media), opacity: 0 }
      : { opacity: 0 };
    const transition = shrink ? (media ? spring : fileExit) : fadeOut;
    void animate(surface, target, transition).then(close);
  }

  return { dialog, panel, scrim, dismiss };
}

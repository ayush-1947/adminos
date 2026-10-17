'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 2;

export function OrgChartViewport({ children, outline }: { children: ReactNode; outline: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const anchor = useRef<{ x: number; y: number; left: number; top: number; zoom: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);

  function changeZoom(value: number, x?: number, y?: number) {
    const element = viewport.current;
    if (!element) return;
    anchor.current = {
      x: x ?? element.clientWidth / 2,
      y: y ?? element.clientHeight / 2,
      left: element.scrollLeft,
      top: element.scrollTop,
      zoom: zoomRef.current,
    };
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    zoomRef.current = next;
    setZoom(next);
  }

  useLayoutEffect(() => {
    const element = viewport.current;
    const point = anchor.current;
    if (!element || !point) return;
    const ratio = zoom / point.zoom;
    element.scrollLeft = (point.left + point.x) * ratio - point.x;
    element.scrollTop = (point.top + point.y) * ratio - point.y;
    anchor.current = null;
  }, [zoom]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = element!.getBoundingClientRect();
      changeZoom(zoomRef.current * Math.exp(-event.deltaY * 0.005), event.clientX - bounds.left, event.clientY - bounds.top);
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function fit() {
    if (!viewport.current || !content.current) return;
    const width = content.current.scrollWidth;
    const height = content.current.scrollHeight;
    changeZoom(Math.min((viewport.current.clientWidth - 32) / width, (viewport.current.clientHeight - 32) / height, 1), 0, 0);
    if (anchor.current) { anchor.current.left = 0; anchor.current.top = 0; }
    viewport.current.scrollTo(0, 0);
  }

  function reset() {
    changeZoom(1, 0, 0);
    if (anchor.current) { anchor.current.left = 0; anchor.current.top = 0; }
    viewport.current?.scrollTo(0, 0);
  }

  return (
    <div className="org-chart-frame">
      <div className="org-zoom-toolbar" role="group" aria-label="Chart zoom controls">
        <span className="org-pan-hint">Drag the background to pan</span>
        <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom / 1.25)}><ZoomOut size={16} /></button>
        <output aria-label="Chart zoom" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom * 1.25)}><ZoomIn size={16} /></button>
        <button type="button" onClick={fit}><Maximize2 size={15} /> Fit</button>
        <button type="button" onClick={reset}><RotateCcw size={15} /> Reset</button>
      </div>
      <div
        ref={viewport}
        className={`org-chart-scroll org-chart-viewport ${outline ? 'org-outline' : ''} ${panning ? 'org-panning' : ''}`}
        tabIndex={0}
        role="group"
        aria-label="Reporting hierarchy. Use zoom controls, Control plus mouse wheel, or trackpad pinch to zoom. Drag the background or scroll to explore. Select a person to expand their team."
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(zoom * 1.25); }
          if (event.key === '-') { event.preventDefault(); changeZoom(zoom / 1.25); }
          if (event.key === '0') { event.preventDefault(); changeZoom(1); }
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
          const element = event.currentTarget;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
          element.setPointerCapture(event.pointerId);
          setPanning(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          event.currentTarget.scrollLeft = start.left - (event.clientX - start.x);
          event.currentTarget.scrollTop = start.top - (event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          setPanning(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = null; setPanning(false); }}
      >
        <div ref={content} className="org-chart-content" style={{ zoom }}>{children}</div>
      </div>
    </div>
  );
}

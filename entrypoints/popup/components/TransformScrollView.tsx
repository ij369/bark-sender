import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import { needsTransformScroll } from '../utils/platform';

interface TransformScrollViewProps {
    children: React.ReactNode;
    className?: string;
    sx?: SxProps<Theme>;
    contentSx?: SxProps<Theme>;
    /** 变化时重置滚动位置（如 Dialog 打开） */
    resetKey?: unknown;
}

const MIN_THUMB_HEIGHT = 24;
const MOMENTUM_FRICTION = 0.88;
const MOMENTUM_MIN = 0.35;
const THUMB_LERP_SCROLL = 0.52;
const THUMB_LERP_MIN = 0.38;
const THUMB_LERP_IDLE = 0.9;
const THUMB_SNAP = 0.6;
const THUMB_SETTLE = 0.25;
const SCROLLER_INSET_Y = 3;
const THUMB_HIDE_DELAY = 500;
/** WebKit 离散滚轮单行步进（Scrollbar::pixelsPerLineStep） */
const WEBKIT_PIXELS_PER_LINE = 40;
/** Safari 离散滚轮 deltaY ≈ ±100/档 */
const MOUSE_WHEEL_DELTA_SCALE = 0.30;
/** 鼠标滚轮内容向目标位置插值，接近 Chrome macOS 单行滚动动画 */
const WHEEL_SCROLL_LERP = 0.48;
/** Safari 鼠标滚轮单次 delta 通常较大（如 ±100），低于阈值为触控板 */
const MOUSE_WHEEL_DELTA_THRESHOLD = 48;

const isTrackpadWheel = (event: WheelEvent) => {
    if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
    return Math.abs(event.deltaY) < MOUSE_WHEEL_DELTA_THRESHOLD;
};

const getWheelScrollDelta = (event: WheelEvent) => {
    if (isTrackpadWheel(event)) return event.deltaY;

    const legacyWheelDelta = (event as WheelEvent & { wheelDelta?: number }).wheelDelta;
    if (legacyWheelDelta) {
        return -(legacyWheelDelta / 120) * WEBKIT_PIXELS_PER_LINE;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return event.deltaY * WEBKIT_PIXELS_PER_LINE;
    }

    // 按比例使用 deltaY，保留事件间差异，避免固定步进的一顿一顿
    return event.deltaY * MOUSE_WHEEL_DELTA_SCALE;
};

const scrollContainerSx = {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
} as const;

const contentSxBase = {
    width: '100%',
    boxSizing: 'border-box',
    p: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 2,
} as const;

const getTrackHeight = (h: number) => Math.max(0, h - SCROLLER_INSET_Y * 2);

const getThumbLayout = (viewportHeight: number, contentHeight: number, thumbY: number, maxScroll: number) => {
    if (contentHeight <= viewportHeight) return null;
    const trackHeight = getTrackHeight(viewportHeight);
    const thumbHeight = Math.max(MIN_THUMB_HEIGHT, (trackHeight / contentHeight) * trackHeight);
    const thumbTravel = trackHeight - thumbHeight;
    const thumbOffset = maxScroll > 0 && thumbTravel > 0 ? (thumbY / maxScroll) * thumbTravel : 0;
    return { thumbHeight, thumbOffset };
};

function SafariTransformScroll({ children, className, sx, contentSx, resetKey }: TransformScrollViewProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const scrollYRef = useRef(0);
    const scrollTargetRef = useRef(0);
    const thumbYRef = useRef(0);
    const maxScrollRef = useRef(0);
    const sizesRef = useRef({ viewport: 0, content: 0 });
    const velocityRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draggingRef = useRef(false);
    const mouseInRailRef = useRef(false);
    const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);

    const [sizes, setSizes] = useState({ viewport: 0, content: 0 });
    const [thumbDragging, setThumbDragging] = useState(false);

    const clamp = (v: number) => Math.max(0, Math.min(maxScrollRef.current, v));

    const stopLoop = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const clearHideTimer = () => {
        if (hideTimerRef.current !== null) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    };

    const cleanup = () => {
        stopLoop();
        clearHideTimer();
    };

    const revealThumb = () => {
        clearHideTimer();
        thumbRef.current?.classList.add('is-visible');
    };

    const hideThumb = () => {
        thumbRef.current?.classList.remove('is-visible');
    };

    const scheduleHideThumb = () => {
        if (mouseInRailRef.current || draggingRef.current) return;
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
            hideTimerRef.current = null;
            if (!mouseInRailRef.current && !draggingRef.current) {
                hideThumb();
            }
        }, THUMB_HIDE_DELAY);
    };

    const syncRender = useCallback(() => {
        contentRef.current?.style.setProperty('--scroll-y', `${scrollYRef.current}px`);

        const thumb = thumbRef.current;
        if (!thumb) return;

        const { viewport, content } = sizesRef.current;
        const layout = getThumbLayout(viewport, content, thumbYRef.current, maxScrollRef.current);
        if (!layout) return;

        thumb.style.setProperty('--thumb-y', `${layout.thumbOffset}px`);
        thumb.style.setProperty('--thumb-height', `${layout.thumbHeight}px`);
    }, []);

    const measure = useCallback(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        if (!viewport || !content) return;

        const viewportHeight = viewport.clientHeight;
        const contentHeight = content.offsetHeight;
        const maxScroll = Math.max(0, contentHeight - viewportHeight);

        maxScrollRef.current = maxScroll;
        sizesRef.current = { viewport: viewportHeight, content: contentHeight };
        setSizes(sizesRef.current);

        if (scrollYRef.current > maxScroll) {
            scrollYRef.current = maxScroll;
            scrollTargetRef.current = maxScroll;
            thumbYRef.current = maxScroll;
            syncRender();
        } else {
            syncRender();
        }
    }, [syncRender]);

    const tick = useCallback(() => {
        rafRef.current = null;

        if (!draggingRef.current) {
            const targetDiff = scrollTargetRef.current - scrollYRef.current;
            if (Math.abs(targetDiff) > 0.25) {
                scrollYRef.current = clamp(scrollYRef.current + targetDiff * WHEEL_SCROLL_LERP);
            } else if (Math.abs(targetDiff) > 0) {
                scrollYRef.current = scrollTargetRef.current;
            }
        }

        if (!draggingRef.current && Math.abs(velocityRef.current) >= MOMENTUM_MIN) {
            velocityRef.current *= MOMENTUM_FRICTION;
            scrollYRef.current = clamp(scrollYRef.current + velocityRef.current);
            scrollTargetRef.current = scrollYRef.current;
        } else if (!draggingRef.current) {
            velocityRef.current = 0;
        }

        const target = scrollYRef.current;
        const thumbDelta = target - thumbYRef.current;

        if (draggingRef.current) {
            thumbYRef.current = target;
        } else {
            const gap = Math.abs(thumbDelta);
            const speed = Math.abs(velocityRef.current);
            const lerp = gap <= THUMB_SNAP ? 1
                : speed >= MOMENTUM_MIN ? Math.max(THUMB_LERP_MIN, THUMB_LERP_SCROLL - speed * 0.008)
                    : Math.min(0.95, THUMB_LERP_IDLE + gap * 0.006);
            thumbYRef.current += thumbDelta * lerp;
        }

        syncRender();

        const active = draggingRef.current
            || Math.abs(velocityRef.current) >= MOMENTUM_MIN
            || Math.abs(scrollTargetRef.current - scrollYRef.current) > 0.25
            || Math.abs(thumbDelta) > THUMB_SETTLE;

        if (active) {
            revealThumb();
            rafRef.current = requestAnimationFrame(tick);
        } else {
            scheduleHideThumb();
        }
    }, [syncRender]);

    const ensureAnim = useCallback(() => {
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(tick);
        }
    }, [tick]);

    useEffect(() => {
        scrollYRef.current = 0;
        scrollTargetRef.current = 0;
        thumbYRef.current = 0;
        velocityRef.current = 0;
        draggingRef.current = false;
        mouseInRailRef.current = false;
        dragRef.current = null;
        cleanup();
        contentRef.current?.style.setProperty('--scroll-y', '0px');
        thumbRef.current?.style.setProperty('--thumb-y', '0px');
        hideThumb();
        setThumbDragging(false);
    }, [resetKey]);

    useEffect(() => {
        measure();
        const viewport = viewportRef.current;
        const content = contentRef.current;
        if (!viewport || !content) return;

        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        observer.observe(content);

        const onWheel = (event: WheelEvent) => {
            if (maxScrollRef.current <= 0) return;
            event.preventDefault();
            event.stopPropagation();

            const delta = getWheelScrollDelta(event);
            const trackpad = isTrackpadWheel(event);

            if (trackpad) {
                scrollYRef.current = clamp(scrollYRef.current + delta);
                scrollTargetRef.current = scrollYRef.current;
                velocityRef.current = delta;
            } else {
                scrollTargetRef.current = clamp(scrollTargetRef.current + delta);
                velocityRef.current = 0;
            }

            syncRender();
            revealThumb();
            ensureAnim();
        };

        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            observer.disconnect();
            viewport.removeEventListener('wheel', onWheel);
            cleanup();
        };
    }, [measure, children, ensureAnim, syncRender]);

    const onRailEnter = () => {
        if (maxScrollRef.current <= 0) return;
        mouseInRailRef.current = true;
        revealThumb();
    };

    const onRailLeave = () => {
        mouseInRailRef.current = false;
        if (!draggingRef.current) scheduleHideThumb();
    };

    const onThumbDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (maxScrollRef.current <= 0) return;
        event.preventDefault();
        draggingRef.current = true;
        setThumbDragging(true);
        mouseInRailRef.current = true;
        revealThumb();
        velocityRef.current = 0;
        dragRef.current = { startY: event.clientY, startScroll: scrollYRef.current };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onThumbMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const maxScroll = maxScrollRef.current;
        const { viewport, content } = sizesRef.current;
        if (!drag || maxScroll <= 0 || viewport <= 0) return;

        const layout = getThumbLayout(viewport, content, thumbYRef.current, maxScroll);
        if (!layout) return;
        const thumbTravel = getTrackHeight(viewport) - layout.thumbHeight;
        if (thumbTravel <= 0) return;

        const next = clamp(drag.startScroll + ((event.clientY - drag.startY) / thumbTravel) * maxScroll);
        scrollYRef.current = next;
        scrollTargetRef.current = next;
        thumbYRef.current = next;
        syncRender();
    };

    const onThumbUp = (event: React.PointerEvent<HTMLDivElement>) => {
        draggingRef.current = false;
        setThumbDragging(false);
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        ensureAnim();
        if (!mouseInRailRef.current) scheduleHideThumb();
    };

    const showScrollbar = sizes.content > sizes.viewport;

    return (
        <Box
            ref={viewportRef}
            className={[
                'u-transform-scroll-view',
                thumbDragging ? 'is-thumb-dragging' : '',
                className,
            ].filter(Boolean).join(' ')}
            sx={{ ...scrollContainerSx, position: 'relative', overflow: 'hidden', touchAction: 'none', ...sx }}
        >
            <Box
                ref={contentRef}
                className="u-transform-scroll-content"
                sx={{
                    ...contentSxBase,
                    pointerEvents: thumbDragging ? 'none' : undefined,
                    ...contentSx,
                }}
            >
                {children}
            </Box>

            {thumbDragging && <Box className="u-transform-scroll-drag-shield" aria-hidden />}

            {showScrollbar && (
                <Box className="u-fake-scrollbar-rail" aria-hidden onMouseEnter={onRailEnter} onMouseLeave={onRailLeave}>
                    <Box
                        ref={thumbRef}
                        className="u-fake-scrollbar-thumb"
                        onPointerDown={onThumbDown}
                        onPointerMove={onThumbMove}
                        onPointerUp={onThumbUp}
                        onPointerCancel={onThumbUp}
                    />
                </Box>
            )}
        </Box>
    );
}

export default function TransformScrollView(props: TransformScrollViewProps) {
    const { children, className, sx, contentSx, resetKey } = props;

    if (!needsTransformScroll()) {
        return (
            <Box
                key={String(resetKey ?? 0)}
                className={className}
                sx={{ ...scrollContainerSx, overflow: 'auto', ...sx }}
            >
                <Box sx={{ ...contentSxBase, ...contentSx }}>{children}</Box>
            </Box>
        );
    }

    return <SafariTransformScroll {...props} />;
}

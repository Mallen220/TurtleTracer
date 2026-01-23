<script lang="ts">
    import { onMount } from 'svelte';
    import { fieldOverlay } from '../../telemetryStore';
    import type { ScaleFunction } from '../../../types';

    export let x: ScaleFunction;
    export let y: ScaleFunction;
    export let width: number;
    export let height: number;

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null = null;
    let renderRequested = false;

    $: ops = $fieldOverlay;

    function render() {
        if (!ctx || !canvas) return;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (!ops || ops.length === 0) return;

        ops.forEach(op => {
            if (!ctx) return;
            ctx.beginPath();
            // Set styles
            const color = op.color || 'black';
            ctx.strokeStyle = color;
            ctx.fillStyle = color;

            // Adjust line width based on scaling?
            // op.strokeWidth might be in pixels or units? Usually pixels in canvas.
            if ('strokeWidth' in op && op.strokeWidth) ctx.lineWidth = op.strokeWidth;
            else ctx.lineWidth = 1;

            if (op.type === 'circle') {
                const rx = Math.abs(x(op.r) - x(0));
                const cx = x(op.x);
                const cy = y(op.y);
                ctx.arc(cx, cy, rx, 0, 2 * Math.PI);
                if (op.stroke !== false) ctx.stroke(); // Default stroke?
                // The interface says `stroke?: boolean`. If true, stroke.
                // But usually we fill circles unless stroke is true?
                // Or maybe `stroke` implies ONLY stroke?
                // Let's assume standard draw: fill is default for shapes?
                // Wait, Packet has `stroke?: boolean` for circle.
                // Assuming if stroke is true, we stroke.
                // What about fill? No fill prop for circle in my type def.
                // Wait, let's check type def again.
                // | { type: 'circle'; x: number; y: number; r: number; color: string; stroke?: boolean; }
                // So color applies to stroke or fill depending on `stroke` flag?
                if (op.stroke) {
                    ctx.stroke();
                } else {
                    ctx.fill();
                }
            } else if (op.type === 'line') {
                ctx.moveTo(x(op.x1), y(op.y1));
                ctx.lineTo(x(op.x2), y(op.y2));
                ctx.stroke();
            } else if (op.type === 'polygon') {
                 if (op.xPoints && op.xPoints.length > 0) {
                     ctx.moveTo(x(op.xPoints[0]), y(op.yPoints[0]));
                     for(let i=1; i<op.xPoints.length; i++) {
                         ctx.lineTo(x(op.xPoints[i]), y(op.yPoints[i]));
                     }
                     ctx.closePath();
                     if (op.fill) ctx.fill();
                     if (op.stroke) ctx.stroke();
                 }
            } else if (op.type === 'text') {
                 ctx.font = `${op.fontSize || 12}px sans-serif`;
                 ctx.fillText(op.content, x(op.x), y(op.y));
            }
        });

        renderRequested = false;
    }

    // Reactive Trigger
    $: {
        if (ops && width && height) {
            if (!renderRequested) {
                renderRequested = true;
                if (typeof requestAnimationFrame !== 'undefined') {
                    requestAnimationFrame(render);
                } else {
                    render();
                }
            }
        }
    }

    onMount(() => {
        ctx = canvas.getContext('2d');
    });

</script>

<canvas
    bind:this={canvas}
    width={width}
    height={height}
    style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 18;"
/>

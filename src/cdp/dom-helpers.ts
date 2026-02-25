import type { CdpClient } from './client.js';

/**
 * Resolve a backendNodeId to a RemoteObjectId via CDP.
 */
export async function resolveNode(cdp: CdpClient, backendNodeId: number): Promise<string> {
  const result = await cdp.send('DOM.resolveNode', { backendNodeId });
  const obj = result.object as { objectId?: string } | undefined;
  if (!obj?.objectId) {
    throw new Error(`Failed to resolve DOM node (backendNodeId=${backendNodeId})`);
  }
  return obj.objectId;
}

/**
 * Scroll an element into view.
 */
export async function scrollIntoView(cdp: CdpClient, objectId: string): Promise<void> {
  await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      this.scrollIntoViewIfNeeded?.(true) ?? this.scrollIntoView({ block: 'center', inline: 'center' });
    }`,
    awaitPromise: false
  });
}

/**
 * Get the center coordinates of an element.
 */
export async function getElementCenter(
  cdp: CdpClient,
  backendNodeId: number
): Promise<{ x: number; y: number }> {
  const result = await cdp.send('DOM.getContentQuads', { backendNodeId });
  const quads = result.quads as number[][] | undefined;
  if (!quads || quads.length === 0) {
    throw new Error('Element has no visible quads (may be hidden or zero-size)');
  }
  const q = quads[0]!;
  // Quad is [x1,y1, x2,y2, x3,y3, x4,y4]
  const x = (q[0]! + q[2]! + q[4]! + q[6]!) / 4;
  const y = (q[1]! + q[3]! + q[5]! + q[7]!) / 4;
  return { x, y };
}

/**
 * Check whether another element is obscuring the target at the given coordinates.
 * Uses document.elementFromPoint() to verify the topmost element at (x, y)
 * is the target element itself or one of its descendants.
 * Throws if the element is occluded by an overlay or another element.
 */
export async function checkOcclusion(
  cdp: CdpClient,
  backendNodeId: number,
  x: number,
  y: number
): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);

  const result = await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function(px, py) {
      var hit = document.elementFromPoint(px, py);
      if (!hit) return 'no-hit';
      if (this === hit || this.contains(hit)) return 'ok';
      // Also check if hit is an ancestor (e.g. clicking a <span> inside <button>)
      if (hit.contains(this)) return 'ok';
      return 'occluded:' + (hit.tagName || '') + (hit.className ? '.' + hit.className.split(' ')[0] : '');
    }`,
    arguments: [{ value: x }, { value: y }],
    returnByValue: true
  });

  const value = (result.result as Record<string, unknown>)?.value as string | undefined;
  if (value && value.startsWith('occluded:')) {
    const blocker = value.slice('occluded:'.length);
    throw new Error(
      `Element is obscured by another element (${blocker}) at coordinates (${Math.round(x)}, ${Math.round(y)}). ` +
        'An overlay or popup may be covering the target.'
    );
  }
}

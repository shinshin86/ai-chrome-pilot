import type { CdpClient } from '../cdp/client.js';
import {
  checkOcclusion,
  getElementCenter,
  resolveNode,
  scrollIntoView
} from '../cdp/dom-helpers.js';
import type { RefEntry } from './types.js';

export type ActionName =
  | 'click'
  | 'type'
  | 'clear'
  | 'focus'
  | 'scroll'
  | 'hover'
  | 'drag'
  | 'select'
  | 'press';

interface ActOptions {
  ref: RefEntry;
  action: ActionName;
  /** Text to type (required for "type" action). */
  value?: string | undefined;
  /** Target ref for drag action. */
  targetRef?: RefEntry | undefined;
  /** Values for select action. */
  values?: string[] | undefined;
  /** Key for press action (e.g. "Enter", "Tab", "ArrowDown"). */
  key?: string | undefined;
}

/**
 * Click an element using CDP Input domain (coordinate-based).
 */
async function clickElement(cdp: CdpClient, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  await scrollIntoView(cdp, objectId);
  // Small delay to let scroll settle
  await new Promise((r) => setTimeout(r, 50));

  const { x, y } = await getElementCenter(cdp, backendNodeId);
  await checkOcclusion(cdp, backendNodeId, x, y);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1
  });
}

/**
 * Type text into an element using CDP.
 * First focuses the element, then uses Input.insertText.
 */
async function typeIntoElement(cdp: CdpClient, backendNodeId: number, text: string): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  await scrollIntoView(cdp, objectId);

  // Focus the element
  await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() { this.focus(); }`,
    awaitPromise: false
  });

  // Clear existing content
  await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      if ('value' in this) { this.value = ''; }
      else if (this.isContentEditable) { this.textContent = ''; }
    }`,
    awaitPromise: false
  });

  // Insert text
  await cdp.send('Input.insertText', { text });
}

/**
 * Clear an input element.
 */
async function clearElement(cdp: CdpClient, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      if ('value' in this) { this.value = ''; this.dispatchEvent(new Event('input', {bubbles:true})); }
      else if (this.isContentEditable) { this.textContent = ''; }
    }`,
    awaitPromise: false
  });
}

/**
 * Focus an element.
 */
async function focusElement(cdp: CdpClient, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  await scrollIntoView(cdp, objectId);
  await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() { this.focus(); }`,
    awaitPromise: false
  });
}

/**
 * Scroll an element into the viewport center.
 */
async function scrollToElement(cdp: CdpClient, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  await scrollIntoView(cdp, objectId);
}

/**
 * Hover over an element.
 */
async function hoverElement(cdp: CdpClient, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  await scrollIntoView(cdp, objectId);
  await new Promise((r) => setTimeout(r, 50));

  const { x, y } = await getElementCenter(cdp, backendNodeId);
  await checkOcclusion(cdp, backendNodeId, x, y);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y
  });
}

/**
 * Drag an element to another element's position.
 */
async function dragElement(
  cdp: CdpClient,
  sourceNodeId: number,
  targetNodeId: number
): Promise<void> {
  const srcObjId = await resolveNode(cdp, sourceNodeId);
  await scrollIntoView(cdp, srcObjId);
  await new Promise((r) => setTimeout(r, 50));

  const src = await getElementCenter(cdp, sourceNodeId);
  const tgt = await getElementCenter(cdp, targetNodeId);
  await checkOcclusion(cdp, sourceNodeId, src.x, src.y);

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: src.x,
    y: src.y,
    button: 'left',
    clickCount: 1
  });
  // Move in steps for realistic drag
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: src.x + (tgt.x - src.x) * ratio,
      y: src.y + (tgt.y - src.y) * ratio,
      button: 'left'
    });
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: tgt.x,
    y: tgt.y,
    button: 'left',
    clickCount: 1
  });
}

/**
 * Select options in a <select> element.
 */
async function selectOptions(
  cdp: CdpClient,
  backendNodeId: number,
  values: string[]
): Promise<void> {
  const objectId = await resolveNode(cdp, backendNodeId);
  const valuesJson = JSON.stringify(values);
  await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      const values = ${valuesJson};
      for (const opt of this.options) {
        opt.selected = values.includes(opt.value) || values.includes(opt.textContent.trim());
      }
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    awaitPromise: false
  });
}

/**
 * Press a key using CDP Input domain.
 */
async function pressKey(cdp: CdpClient, key: string): Promise<void> {
  // Map common key names to CDP key identifiers
  const keyMap: Record<string, { keyCode: number; code: string }> = {
    Enter: { keyCode: 13, code: 'Enter' },
    Tab: { keyCode: 9, code: 'Tab' },
    Escape: { keyCode: 27, code: 'Escape' },
    Backspace: { keyCode: 8, code: 'Backspace' },
    Delete: { keyCode: 46, code: 'Delete' },
    ArrowUp: { keyCode: 38, code: 'ArrowUp' },
    ArrowDown: { keyCode: 40, code: 'ArrowDown' },
    ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
    ArrowRight: { keyCode: 39, code: 'ArrowRight' },
    Space: { keyCode: 32, code: 'Space' }
  };

  const mapped = keyMap[key];
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: mapped?.code ?? key,
    windowsVirtualKeyCode: mapped?.keyCode ?? 0,
    nativeVirtualKeyCode: mapped?.keyCode ?? 0
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: mapped?.code ?? key,
    windowsVirtualKeyCode: mapped?.keyCode ?? 0,
    nativeVirtualKeyCode: mapped?.keyCode ?? 0
  });
}

/**
 * Execute a ref-based action via CDP.
 */
export async function executeAction(cdp: CdpClient, options: ActOptions): Promise<void> {
  const { ref, action, value, targetRef, values, key } = options;

  // Ensure DOM domain is enabled for resolveNode
  await cdp.send('DOM.enable');

  switch (action) {
    case 'click':
      await clickElement(cdp, ref.backendNodeId);
      break;
    case 'type':
      if (!value) throw new Error('"value" is required for type action');
      await typeIntoElement(cdp, ref.backendNodeId, value);
      break;
    case 'clear':
      await clearElement(cdp, ref.backendNodeId);
      break;
    case 'focus':
      await focusElement(cdp, ref.backendNodeId);
      break;
    case 'scroll':
      await scrollToElement(cdp, ref.backendNodeId);
      break;
    case 'hover':
      await hoverElement(cdp, ref.backendNodeId);
      break;
    case 'drag':
      if (!targetRef) throw new Error('"targetRef" is required for drag action');
      await dragElement(cdp, ref.backendNodeId, targetRef.backendNodeId);
      break;
    case 'select':
      if (!values || values.length === 0) throw new Error('"values" is required for select action');
      await selectOptions(cdp, ref.backendNodeId, values);
      break;
    case 'press':
      if (!key) throw new Error('"key" is required for press action');
      await pressKey(cdp, key);
      break;
    default:
      throw new Error(`Unknown action: ${action as string}`);
  }
}

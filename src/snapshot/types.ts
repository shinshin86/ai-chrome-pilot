/** A single entry in the ref map linking a ref ID to a DOM node. */
export interface RefEntry {
  /** Short ref identifier, e.g. "e1", "e2" */
  readonly ref: string;
  /** ARIA role, e.g. "button", "textbox", "link" */
  readonly role: string;
  /** Computed accessible name */
  readonly name: string;
  /** CDP BackendNodeId – used to resolve the element for interaction */
  readonly backendNodeId: number;
}

/** Raw AXNode from CDP Accessibility.getFullAXTree */
export interface RawAXNode {
  nodeId: string;
  ignored?: boolean;
  role?: { type: string; value: string };
  name?: { type: string; value: string };
  description?: { type: string; value: string };
  value?: { type: string; value: string };
  properties?: Array<{ name: string; value: { type: string; value: unknown } }>;
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
  frameId?: string;
}

/** Result of a snapshot operation */
export interface SnapshotResult {
  /** Human-readable text representation of the page structure */
  snapshot: string;
  /** List of interactable elements with their ref IDs */
  refs: RefEntry[];
}

import type { CdpClient } from '../cdp/client.js';
import type { RawAXNode, RefEntry, SnapshotResult } from './types.js';

/** ARIA roles considered interactable – elements with these roles get ref IDs. */
const INTERACTABLE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem'
]);

interface TreeNode {
  role: string;
  name: string;
  backendNodeId?: number | undefined;
  ref?: string | undefined;
  children: TreeNode[];
}

/**
 * Manages accessibility snapshots and the ref map.
 * Holds the ref→backendNodeId mapping so that subsequent /act calls
 * can resolve elements without a new snapshot.
 */
export class SnapshotEngine {
  private refMap = new Map<string, RefEntry>();
  private refCounter = 0;

  /** Look up a ref entry by its ref ID (e.g. "e5"). */
  getRef(ref: string): RefEntry | undefined {
    return this.refMap.get(ref);
  }

  /** Take a fresh snapshot of the current page via CDP. */
  async takeSnapshot(cdp: CdpClient): Promise<SnapshotResult> {
    // Enable accessibility domain
    await cdp.send('Accessibility.enable');

    // Fetch the full accessibility tree
    const result = await cdp.send('Accessibility.getFullAXTree', { depth: -1 });
    const rawNodes = (result.nodes as RawAXNode[] | undefined) ?? [];

    // Build lookup map
    const nodeMap = new Map<string, RawAXNode>();
    for (const node of rawNodes) {
      nodeMap.set(node.nodeId, node);
    }

    // Reset ref state
    this.refMap.clear();
    this.refCounter = 0;

    // Find root nodes (nodes without parentId or whose parent is not in the map)
    const rootIds = rawNodes
      .filter((n) => !n.parentId || !nodeMap.has(n.parentId))
      .map((n) => n.nodeId);

    // Build tree and assign refs
    const trees = rootIds.map((id) => this.buildTree(nodeMap, id)).filter(Boolean) as TreeNode[];

    // Generate text output
    const lines: string[] = [];
    for (const tree of trees) {
      this.renderTree(tree, 0, lines);
    }

    const refs = [...this.refMap.values()];

    return {
      snapshot: lines.join('\n'),
      refs
    };
  }

  private buildTree(nodeMap: Map<string, RawAXNode>, nodeId: string): TreeNode | null {
    const raw = nodeMap.get(nodeId);
    if (!raw) return null;

    // Skip ignored nodes but still process their children
    if (raw.ignored) {
      const children: TreeNode[] = [];
      for (const childId of raw.childIds ?? []) {
        const child = this.buildTree(nodeMap, childId);
        if (child) children.push(child);
      }
      // If an ignored node has children, return them collapsed
      if (children.length === 1) return children[0] ?? null;
      if (children.length > 1) {
        return { role: 'group', name: '', children };
      }
      return null;
    }

    const role = raw.role?.value ?? 'unknown';
    const name = raw.name?.value ?? '';
    const backendNodeId: number | undefined = raw.backendDOMNodeId;

    // Skip "none" and "generic" roles unless they have a name
    if ((role === 'none' || role === 'generic') && !name) {
      const children: TreeNode[] = [];
      for (const childId of raw.childIds ?? []) {
        const child = this.buildTree(nodeMap, childId);
        if (child) children.push(child);
      }
      if (children.length === 1) return children[0] ?? null;
      if (children.length > 1) {
        return { role: 'group', name: '', children };
      }
      return null;
    }

    const node: TreeNode = {
      role,
      name,
      backendNodeId,
      children: []
    };

    // Assign ref if interactable
    if (backendNodeId !== undefined && INTERACTABLE_ROLES.has(role)) {
      const ref = `e${++this.refCounter}`;
      node.ref = ref;
      this.refMap.set(ref, { ref, role, name, backendNodeId });
    }

    // Process children
    for (const childId of raw.childIds ?? []) {
      const child = this.buildTree(nodeMap, childId);
      if (child) node.children.push(child);
    }

    return node;
  }

  private renderTree(node: TreeNode, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth);
    let line = `${indent}- ${node.role}`;
    if (node.name) {
      line += ` "${node.name}"`;
    }
    if (node.ref) {
      line += ` [ref=${node.ref}]`;
    }

    // Skip empty group wrappers
    if (node.role === 'group' && !node.name && !node.ref) {
      for (const child of node.children) {
        this.renderTree(child, depth, lines);
      }
      return;
    }

    lines.push(line);
    for (const child of node.children) {
      this.renderTree(child, depth + 1, lines);
    }
  }
}

import type { WorkoutWorkspaceFile } from '@hone/shared';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

interface FileNode {
  kind: 'file';
  name: string;
  path: string;
  editable: boolean;
}

interface DirNode {
  kind: 'dir';
  name: string;
  path: string;
  children: TreeNode[];
}

type TreeNode = DirNode | FileNode;

/**
 * Group a sorted path list into a tree. The server sorts it, so this only has to
 * preserve that order: a second sort here would be a second opinion about which
 * of two orderings the reader sees.
 */
function buildTree(files: WorkoutWorkspaceFile[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const dirs = new Map<string, DirNode>();

  for (const file of files) {
    const segments = file.path.split('/');
    const name = segments.pop() ?? file.path;
    let siblings = roots;
    let prefix = '';

    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let dir = dirs.get(prefix);
      if (!dir) {
        dir = { kind: 'dir', name: segment, path: prefix, children: [] };
        dirs.set(prefix, dir);
        siblings.push(dir);
      }
      siblings = dir.children;
    }

    siblings.push({ kind: 'file', name, path: file.path, editable: file.editable });
  }

  // `src` wraps everything and names nothing, so the tree starts inside it.
  return roots.length === 1 && roots[0]?.kind === 'dir' && roots[0].path === 'src'
    ? roots[0].children
    : roots;
}

export function FileTree({
  files,
  activePath,
  onSelect,
}: {
  files: WorkoutWorkspaceFile[];
  activePath: string;
  onSelect: (path: string) => void;
}): React.ReactElement {
  const tree = React.useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());

  const toggle = (path: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  };

  return (
    <nav aria-label="Workout files" className="rounded-md border bg-card p-1 text-sm">
      <Level
        nodes={tree}
        depth={0}
        activePath={activePath}
        collapsed={collapsed}
        onSelect={onSelect}
        onToggle={toggle}
      />
    </nav>
  );
}

function Level({
  nodes,
  depth,
  activePath,
  collapsed,
  onSelect,
  onToggle,
}: {
  nodes: TreeNode[];
  depth: number;
  activePath: string;
  collapsed: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}): React.ReactElement {
  return (
    <ul className="space-y-px">
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              aria-expanded={!collapsed.has(node.path)}
              className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
              style={{ paddingLeft: `${String(depth * 0.75 + 0.375)}rem` }}
            >
              {collapsed.has(node.path) ? (
                <ChevronRight className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {!collapsed.has(node.path) && (
              <Level
                nodes={node.children}
                depth={depth + 1}
                activePath={activePath}
                collapsed={collapsed}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            )}
          </li>
        ) : (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              aria-current={node.path === activePath ? 'true' : undefined}
              // A read-only file is dimmed rather than hidden or disabled: the
              // brief tells you to read several of them, so it has to be
              // openable and has to look unlike the ones you can change.
              className={cn(
                'flex w-full items-center gap-1.5 rounded py-1 pr-1.5 text-left',
                node.path === activePath
                  ? 'bg-secondary font-medium text-secondary-foreground'
                  : node.editable
                    ? 'hover:bg-accent'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              style={{ paddingLeft: `${String(depth * 0.75 + 0.875)}rem` }}
              title={node.editable ? node.path : `${node.path} (read-only)`}
            >
              <span className="truncate">{node.name}</span>
              {!node.editable && (
                <Lock aria-label="read-only" className="ml-auto size-3 shrink-0" />
              )}
            </button>
          </li>
        )
      )}
    </ul>
  );
}

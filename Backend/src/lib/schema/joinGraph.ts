/**
 * Join graph: validate that retrieved tables are connected via FK relationships
 * so the LLM never gets an impossible set of tables
 */
import { getInternalDb } from "../db/internal.js";

/** Build adjacency list: table_id -> Set of table_ids reachable via one join (from or to) */
function buildJoinGraph(dbId: string): Map<string, Set<string>> {
  const db = getInternalDb();
  const tables = db
    .prepare("SELECT id, table_name FROM schema_tables WHERE db_id = ?")
    .all(dbId) as { id: string; table_name: string }[];
  const nameToId = new Map(tables.map((t) => [t.table_name, t.id]));

  const rels = db
    .prepare(
      "SELECT from_table_id, to_table_name FROM schema_relationships WHERE db_id = ?"
    )
    .all(dbId) as { from_table_id: string; to_table_name: string }[];

  const graph = new Map<string, Set<string>>();
  for (const t of tables) {
    if (!graph.has(t.id)) graph.set(t.id, new Set());
  }
  for (const r of rels) {
    const toId = nameToId.get(r.to_table_name);
    if (toId && r.from_table_id !== toId) {
      const fromSet = graph.get(r.from_table_id);
      if (fromSet) fromSet.add(toId);
      const toSet = graph.get(toId);
      if (toSet) toSet.add(r.from_table_id);
    }
  }
  return graph;
}

/** Get the largest connected component that includes the given table IDs (prefer keeping earlier IDs) */
function largestConnectedComponent(
  tableIds: string[],
  graph: Map<string, Set<string>>
): string[] {
  if (tableIds.length <= 1) return tableIds;

  const idSet = new Set(tableIds);
  const visited = new Set<string>();
  let bestComponent: string[] = [];

  for (const startId of tableIds) {
    if (visited.has(startId)) continue;
    const component: string[] = [];
    const stack = [startId];
    const inComponent = new Set<string>();

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (inComponent.has(id)) continue;
      inComponent.add(id);
      visited.add(id);
      if (idSet.has(id)) component.push(id);

      const neighbors = graph.get(id);
      if (neighbors) {
        for (const n of neighbors) {
          if (!inComponent.has(n)) stack.push(n);
        }
      }
    }

    if (component.length > bestComponent.length) {
      bestComponent = component;
    }
  }

  return bestComponent.length > 0 ? bestComponent : tableIds;
}

/**
 * Ensure the given table set is connected in the join graph.
 * If not, return the largest connected component so the LLM only sees joinable tables.
 */
export function ensureConnectedTables(dbId: string, tableIds: string[]): string[] {
  if (tableIds.length <= 1) return tableIds;

  const graph = buildJoinGraph(dbId);
  return largestConnectedComponent(tableIds, graph);
}

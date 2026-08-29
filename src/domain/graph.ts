import type { BaseEntity, EntityType, GraphEdge, ScenarioData } from './types.js';

export function allEntities(scenario: ScenarioData): BaseEntity[] {
  return [
    ...scenario.suppliers,
    ...scenario.components,
    ...scenario.factories,
    ...scenario.lines,
    ...scenario.lanes,
    ...scenario.hubs,
    ...scenario.products,
    ...scenario.orders,
    ...scenario.customers,
  ];
}

export function entityById(scenario: ScenarioData, id: string): BaseEntity | undefined {
  return allEntities(scenario).find((entity) => entity.id === id);
}

export function linkedEntityIds(
  scenario: ScenarioData,
  sourceId: string,
  direction: 'downstream' | 'upstream' | 'both',
  maxDepth: number,
): { ids: string[]; paths: string[][]; edges: GraphEdge[] } {
  const queue: Array<{ id: string; depth: number; path: string[] }> = [{ id: sourceId, depth: 0, path: [sourceId] }];
  const visited = new Set<string>([sourceId]);
  const paths: string[][] = [];
  const usedEdges = new Map<string, GraphEdge>();

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) {
      paths.push(current.path);
      continue;
    }
    const candidates = scenario.edges.filter((edge) => {
      if (direction === 'downstream') return edge.fromId === current.id;
      if (direction === 'upstream') return edge.toId === current.id;
      return edge.fromId === current.id || edge.toId === current.id;
    });
    let extended = false;
    for (const graphEdge of candidates) {
      const nextId = graphEdge.fromId === current.id ? graphEdge.toId : graphEdge.fromId;
      usedEdges.set(graphEdge.id, graphEdge);
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push({ id: nextId, depth: current.depth + 1, path: [...current.path, nextId] });
        extended = true;
      }
    }
    if (!extended) paths.push(current.path);
  }
  return { ids: [...visited], paths, edges: [...usedEdges.values()] };
}

export function countsByType(scenario: ScenarioData, ids: string[]): Partial<Record<EntityType, number>> {
  const result: Partial<Record<EntityType, number>> = {};
  for (const id of ids) {
    const entity = entityById(scenario, id);
    if (!entity) continue;
    result[entity.type] = (result[entity.type] ?? 0) + 1;
  }
  return result;
}

export function upstreamIds(scenario: ScenarioData, id: string, limit = 12): string[] {
  return scenario.edges.filter((edge) => edge.toId === id).slice(0, limit).map((edge) => edge.fromId);
}

export function downstreamIds(scenario: ScenarioData, id: string, limit = 12): string[] {
  return scenario.edges.filter((edge) => edge.fromId === id).slice(0, limit).map((edge) => edge.toId);
}

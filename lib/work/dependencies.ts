export type DependencyEdge = {taskId: string; dependsOnTaskId: string; dependencyType: string};
export type DependencyRow = {task_id: string; depends_on_task_id: string; dependency_type: string};
export const dependencyEdge = (row: DependencyRow): DependencyEdge => ({
  taskId: row.task_id,
  dependsOnTaskId: row.depends_on_task_id,
  dependencyType: row.dependency_type,
});
export function wouldCreateCycle(
  edges: DependencyEdge[],
  taskId: string,
  dependsOnTaskId: string,
  maxNodes = 1000,
) {
  if (taskId === dependsOnTaskId) return true;
  const graph = new Map<string, string[]>();
  for (const e of edges.filter((x) => x.dependencyType !== "related"))
    graph.set(e.taskId, [...(graph.get(e.taskId) ?? []), e.dependsOnTaskId]);
  graph.set(taskId, [...(graph.get(taskId) ?? []), dependsOnTaskId]);
  const seen = new Set<string>(),
    stack = [dependsOnTaskId];
  while (stack.length && seen.size < maxNodes) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  if (stack.length) throw new Error("Dependency graph exceeds the safe traversal limit.");
  return false;
}

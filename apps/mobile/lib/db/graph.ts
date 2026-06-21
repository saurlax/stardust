import type { NebulaTree } from "@/components/NebulaView";
import type { EntityRecord, ReflectionRecord, RelationRecord, StoredMemory } from "@/lib/db";

const SELF_ENTITY_ID = "entity-self";

const memoryTypeOrder = [
  "open_loop",
  "preference",
  "fact",
  "relationship",
  "project",
  "concern",
  "goal",
  "routine",
  "memory",
  "task",
  "opinion",
];

type BuildMemoryTreeOptions = {
  rootTitle?: string;
  memoryTypeLabel?: (type: string) => string;
  relationTypeLabel?: (type: string) => string;
};

const truncateLabel = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const graphMemoryType = (memory: StoredMemory) =>
  memory.candidateKind === "open_loop" ? "open_loop" : memory.type;

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2);

export const buildMemoryTree = (
  memories: StoredMemory[],
  reflections: ReflectionRecord[] = [],
  entities: EntityRecord[] = [],
  relations: RelationRecord[] = [],
  options: BuildMemoryTreeOptions = {},
): NebulaTree => {
  const nodes: NebulaTree["nodes"] = [{ id: "root", title: options.rootTitle ?? "you", size: 10 }];
  const visibleMemories = memories.slice(0, 48);
  const visibleReflections = reflections.slice(0, 8);
  const typeNodes = new Set<string>();

  for (const type of memoryTypeOrder) {
    if (!visibleMemories.some((memory) => graphMemoryType(memory) === type)) continue;
    typeNodes.add(type);
    nodes.push({
      id: `type-${type}`,
      title: options.memoryTypeLabel?.(type) ?? type,
      linksTo: ["root"],
      size: 7.5,
      accent: type === "open_loop" ? "open_loop" : "type",
    });
  }

  visibleReflections.forEach((reflection, index) => {
    nodes.push({
      id: `reflection-${reflection.id}`,
      title: truncateLabel(reflection.title, 18),
      linksTo: ["root"],
      size: 8 - index * 0.15,
      accent: "reflection",
    });
  });

  const visibleEntities = entities.filter((entity) => entity.id !== SELF_ENTITY_ID).slice(0, 16);
  const visibleEntityIds = new Set(visibleEntities.map((entity) => entity.id));

  visibleEntities.forEach((entity, index) => {
    const relationLinks = relations
      .filter((relation) => relation.targetEntityId === entity.id)
      .flatMap((relation) => {
        if (relation.sourceEntityId === SELF_ENTITY_ID) return ["root"];
        return visibleEntityIds.has(relation.sourceEntityId)
          ? [`entity-${relation.sourceEntityId}`]
          : [];
      });
    nodes.push({
      id: `entity-${entity.id}`,
      title: truncateLabel(entity.name, 18),
      linksTo: relationLinks.length ? relationLinks : ["root"],
      size: 6.8 - Math.min(index, 12) * 0.08,
      accent: "entity",
    });
  });

  relations
    .filter(
      (relation) =>
        visibleEntityIds.has(relation.sourceEntityId) ||
        visibleEntityIds.has(relation.targetEntityId) ||
        relation.sourceEntityId === SELF_ENTITY_ID,
    )
    .slice(0, 24)
    .forEach((relation, index) => {
      const linksTo = [
        relation.sourceEntityId === SELF_ENTITY_ID
          ? "root"
          : visibleEntityIds.has(relation.sourceEntityId)
            ? `entity-${relation.sourceEntityId}`
            : undefined,
        visibleEntityIds.has(relation.targetEntityId)
          ? `entity-${relation.targetEntityId}`
          : undefined,
      ].filter((nodeId): nodeId is string => !!nodeId);

      nodes.push({
        id: `relation-${relation.id}`,
        title: truncateLabel(options.relationTypeLabel?.(relation.type) ?? relation.type, 18),
        linksTo: linksTo.length ? linksTo : ["root"],
        size: 4.6 + Math.min(relation.weight, 6) * 0.18 - Math.min(index, 18) * 0.04,
        accent: relation.sourceKind === "iot" ? "iot" : "relation",
      });
    });

  visibleMemories.forEach((memory, index) => {
    const memoryType = graphMemoryType(memory);
    const parentId = typeNodes.has(memoryType) ? `type-${memoryType}` : "root";
    const tokens = tokenize(memory.content);
    const related = visibleMemories
      .slice(0, index)
      .find((previous) => tokenize(previous.content).some((token) => tokens.includes(token)));
    nodes.push({
      id: `memory-${memory.id}`,
      title: truncateLabel(memory.content, 20),
      linksTo: related ? [parentId, `memory-${related.id}`] : [parentId],
      size: 5.2 + Math.min(memory.importance, 5) * 0.35,
      accent:
        memory.candidateKind === "open_loop"
          ? "open_loop"
          : memory.sourceKind === "iot"
            ? "iot"
            : "memory",
    });
  });

  return { nodes };
};

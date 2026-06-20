import type { NebulaTree } from "@/components/NebulaView";
import type { EntityRecord, ReflectionRecord, RelationRecord, StoredMemory } from "@/lib/db";

const SELF_ENTITY_ID = "entity-self";

const memoryTypeOrder = [
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
): NebulaTree => {
  const nodes: NebulaTree["nodes"] = [{ id: "root", title: "you", size: 10 }];
  const visibleMemories = memories.slice(0, 48);
  const visibleReflections = reflections.slice(0, 8);
  const typeNodes = new Set<string>();

  for (const type of memoryTypeOrder) {
    if (!visibleMemories.some((memory) => memory.type === type)) continue;
    typeNodes.add(type);
    nodes.push({
      id: `type-${type}`,
      title: type,
      linksTo: ["root"],
      size: 7.5,
    });
  }

  visibleReflections.forEach((reflection, index) => {
    nodes.push({
      id: `reflection-${reflection.id}`,
      title: reflection.title.length > 18 ? `${reflection.title.slice(0, 18)}...` : reflection.title,
      linksTo: ["root"],
      size: 8 - index * 0.15,
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
      title: entity.name.length > 18 ? `${entity.name.slice(0, 18)}...` : entity.name,
      linksTo: relationLinks.length ? relationLinks : ["root"],
      size: 6.8 - Math.min(index, 12) * 0.08,
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
        title: relation.type.length > 18 ? `${relation.type.slice(0, 18)}...` : relation.type,
        linksTo: linksTo.length ? linksTo : ["root"],
        size: 4.6 + Math.min(relation.weight, 6) * 0.18 - Math.min(index, 18) * 0.04,
      });
    });

  visibleMemories.forEach((memory, index) => {
    const parentId = typeNodes.has(memory.type) ? `type-${memory.type}` : "root";
    const tokens = tokenize(memory.content);
    const related = visibleMemories
      .slice(0, index)
      .find((previous) => tokenize(previous.content).some((token) => tokens.includes(token)));
    nodes.push({
      id: `memory-${memory.id}`,
      title: memory.content.length > 20 ? `${memory.content.slice(0, 20)}...` : memory.content,
      linksTo: related ? [parentId, `memory-${related.id}`] : [parentId],
      size: 5.2 + Math.min(memory.importance, 5) * 0.35,
    });
  });

  return { nodes };
};

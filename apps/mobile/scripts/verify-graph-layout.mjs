import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const graphSource = fs.readFileSync(path.join(mobileRoot, "lib", "db", "graph.ts"), "utf8");
const memoryScreen = fs.readFileSync(path.join(mobileRoot, "app", "memory.tsx"), "utf8");
const nebulaView = fs.readFileSync(path.join(mobileRoot, "components", "NebulaView.tsx"), "utf8");

const assertIncludes = (source, value, message) => {
  if (!source.includes(value)) {
    throw new Error(message);
  }
};

const createGraph = (count) => {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "root" : `memory-${index}`,
  }));
  const links = nodes.slice(1).map((node, index) => ({
    source: index % 4 === 0 ? "root" : `memory-${Math.max(1, index)}`,
    target: node.id,
  }));
  return { nodes, links };
};

const assertFiniteLayout = ({ nodes, links }, label) => {
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .id((node) => node.id)
        .distance(72)
        .strength(0.55),
    )
    .force("charge", forceManyBody().strength(-170).distanceMax(360))
    .force("collide", forceCollide().radius(28).strength(0.82))
    .force("center", forceCenter(0, 0).strength(0.08))
    .stop();

  simulation.tick(180);

  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      throw new Error(`${label} graph produced a non-finite position for ${node.id}.`);
    }
  }

  if (nodes.length > 1) {
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    if (width <= 1 || height <= 1) {
      throw new Error(`${label} graph did not spread nodes into a visible layout.`);
    }
  }
};

assertFiniteLayout(createGraph(0), "empty");
assertFiniteLayout(createGraph(3), "small");
assertFiniteLayout(createGraph(120), "large");

assertIncludes(graphSource, 'id: "root"', "Memory graph must keep a root node.");
assertIncludes(graphSource, "memories.slice(0, 48)", "Memory graph must cap visible memory nodes.");
assertIncludes(graphSource, "reflections.slice(0, 8)", "Memory graph must cap visible reflection nodes.");
assertIncludes(graphSource, ".slice(0, 16)", "Memory graph must cap visible entity nodes.");
assertIncludes(graphSource, ".slice(0, 24)", "Memory graph must cap visible relation nodes.");
assertIncludes(graphSource, "memoryTypeLabel", "Memory graph must allow user-facing memory type labels.");
assertIncludes(graphSource, "relationTypeLabel", "Memory graph must allow user-facing relation labels.");
assertIncludes(graphSource, 'memory.candidateKind === "open_loop" ? "open_loop"', "Memory graph must group confirmed open loops separately.");
assertIncludes(memoryScreen, "memoryTypeLabel: getMemoryTypeLabel", "Memory graph screen must localize type node labels.");
assertIncludes(memoryScreen, "relationTypeLabel: getRelationTypeLabel", "Memory graph screen must localize relation node labels.");
assertIncludes(memoryScreen, "matchesMemoryType(memory, type)", "Memory graph type details must include open-loop grouped memories.");
assertIncludes(nebulaView, "@shopify/react-native-skia", "Memory graph renderer must use Skia.");
assertIncludes(nebulaView, 'from "d3-force"', "Memory graph renderer must use d3-force.");
assertIncludes(nebulaView, "forceSimulation(forceNodes)", "Memory graph renderer must run a force simulation over graph nodes.");
assertIncludes(nebulaView, "forceLink<ForceNode, ForceLink>(forceLinks)", "Memory graph renderer must use forceLink for graph edges.");
assertIncludes(nebulaView, "forceManyBody().strength", "Memory graph renderer must use many-body spacing.");
assertIncludes(nebulaView, "forceCollide<ForceNode>()", "Memory graph renderer must avoid node overlap.");
assertIncludes(nebulaView, ".stop()", "Memory graph renderer must stop d3's internal timer for React rendering.");
assertIncludes(nebulaView, ".tick(Math.min(180", "Memory graph renderer must manually tick bounded layouts.");
assertIncludes(nebulaView, "Gesture.Pan()", "Memory graph renderer must support native pan.");
assertIncludes(nebulaView, "Gesture.Pinch()", "Memory graph renderer must support native pinch zoom.");
assertIncludes(nebulaView, "onWheel", "Memory graph renderer must support web zoom.");
assertIncludes(nebulaView, "onPointerMove", "Memory graph renderer must support web pan.");
for (const prefix of ["type-", "memory-", "reflection-", "entity-", "relation-"]) {
  assertIncludes(graphSource, prefix, `Memory graph is missing ${prefix} nodes.`);
}
assertIncludes(memoryScreen, "function OpenSourceButton", "Memory graph details must expose source episode navigation.");
assertIncludes(memoryScreen, "function ScreenOffBadge", "Memory graph details must expose screen-off capture badges.");
assertIncludes(memoryScreen, "<ScreenOffBadge sourceKind={memory.sourceKind} />", "Saved memory cards must show screen-off capture badges.");
assertIncludes(memoryScreen, "isScreenOff: memory.sourceKind === \"iot\"", "Selected memory details must preserve screen-off source state.");
assertIncludes(memoryScreen, "selectedNode.isScreenOff", "Selected graph node details must show screen-off capture badges.");
assertIncludes(memoryScreen, "<OpenSourceButton episodeId={memory.episodeId} />", "Saved memory cards must link to source episodes.");
assertIncludes(memoryScreen, "sourceTitle: memory.sourceTitle", "Selected memory details must retain source titles.");
assertIncludes(memoryScreen, "relationSource?.episodeId", "Entity graph details must link relation source episodes.");
assertIncludes(memoryScreen, "relationSource?.sourceTitle", "Entity graph details must retain relation source titles.");
assertIncludes(memoryScreen, "`relation-${item.id}`", "Memory graph must expose selected relation details.");
assertIncludes(memoryScreen, "memory.relationNodeDescription", "Selected relation details must be labeled.");
assertIncludes(memoryScreen, "setErrorMessage(t(\"memory.loadFailed\"))", "Memory graph load failures must be visible.");
assertIncludes(memoryScreen, ".catch(onError)", "Saved memory actions must surface failures.");
assertIncludes(memoryScreen, "{relations.length}", "Memory graph must expose relation counts.");
assertIncludes(memoryScreen, "filterCounts", "Memory graph filters must expose memory counts.");
assertIncludes(memoryScreen, "filterCounts[item]", "Memory graph filter labels must display counts.");
assertIncludes(memoryScreen, "memory.candidateKind === \"open_loop\"", "Memory graph filter counts must include open loops.");
assertIncludes(memoryScreen, "getMemoryTypeLabel", "Saved memory cards must use localized memory type labels.");

console.log("Memory graph layout invariants look valid.");

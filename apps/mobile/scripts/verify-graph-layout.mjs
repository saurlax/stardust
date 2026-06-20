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
for (const prefix of ["type-", "memory-", "reflection-", "entity-", "relation-"]) {
  assertIncludes(graphSource, prefix, `Memory graph is missing ${prefix} nodes.`);
}
assertIncludes(memoryScreen, "function OpenSourceButton", "Memory graph details must expose source episode navigation.");
assertIncludes(memoryScreen, "<OpenSourceButton episodeId={memory.episodeId} />", "Saved memory cards must link to source episodes.");
assertIncludes(memoryScreen, "relationSource?.episodeId", "Entity graph details must link relation source episodes.");
assertIncludes(memoryScreen, "`relation-${item.id}`", "Memory graph must expose selected relation details.");
assertIncludes(memoryScreen, "memory.relationNodeDescription", "Selected relation details must be labeled.");
assertIncludes(memoryScreen, "setErrorMessage(t(\"memory.loadFailed\"))", "Memory graph load failures must be visible.");
assertIncludes(memoryScreen, ".catch(onError)", "Saved memory actions must surface failures.");
assertIncludes(memoryScreen, "{relations.length}", "Memory graph must expose relation counts.");

console.log("Memory graph layout invariants look valid.");

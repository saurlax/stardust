import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";

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

console.log("Memory graph layout invariants look valid.");

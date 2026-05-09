import { Canvas, Circle, Line, vec } from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { theme } from "@/components/ui";

type RenderNode = {
  id: string;
  title?: string;
  x?: number;
  y?: number;
  z?: number;
  size?: number;
  alpha?: number;
  speed?: number;
  phase?: number;
  linksTo?: string[];
};

export type NebulaTree = {
  nodes: RenderNode[];
};

type LayoutNode = {
  id: string;
  title?: string;
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  speed: number;
  phase: number;
  parentIds: string[];
};

const defaultTree: NebulaTree = {
  nodes: Array.from({ length: 28 }, (_, index) => ({
    id: `n-${index}`,
    title: `n-${index}`,
  })),
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const animateNodePoint = (node: LayoutNode, time: number) => {
  const wobbleAmp = 0.005 + node.speed * 0.008;
  const x = node.x + Math.sin(time * 0.001 + node.phase * 1.3) * wobbleAmp;
  const y = node.y + Math.cos(time * 0.0009 + node.phase * 1.7) * wobbleAmp * 0.85;
  const z = node.z + Math.sin(time * 0.00075 + node.phase * 0.6) * wobbleAmp * 0.35;
  return [x, y, z] as const;
};

const buildLayoutNodes = (tree: NebulaTree): LayoutNode[] => {
  const byId = new Map(tree.nodes.map((node) => [node.id, node] as const));
  const root = tree.nodes.find((node) => node.id === "root") ?? tree.nodes[0];
  const parentMap = new Map<string, string[]>();
  const childrenMap = new Map<string, string[]>();

  for (const node of tree.nodes) {
    const parents = (node.linksTo ?? []).filter((parentId) => byId.has(parentId));
    parentMap.set(node.id, parents);
    for (const parentId of parents) {
      const children = childrenMap.get(parentId) ?? [];
      children.push(node.id);
      childrenMap.set(parentId, children);
    }
  }

  const depthMap = new Map<string, number>();
  if (root) depthMap.set(root.id, 0);
  const queue = root ? [root.id] : [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depthMap.get(currentId) ?? 0;
    for (const node of tree.nodes) {
      const parents = parentMap.get(node.id) ?? [];
      if (!parents.includes(currentId)) continue;
      const nextDepth = currentDepth + 1;
      const prevDepth = depthMap.get(node.id);
      if (prevDepth === undefined || nextDepth < prevDepth) {
        depthMap.set(node.id, nextDepth);
        queue.push(node.id);
      }
    }
  }

  for (const node of tree.nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, root && node.id !== root.id ? 1 : 0);
    }
  }

  const maxDepth = Math.max(...Array.from(depthMap.values()), 1);
  const pos = new Map<string, { x: number; y: number; z: number }>();
  const placed = new Set<string>();

  if (root) {
    pos.set(root.id, { x: 0, y: -0.02, z: 0.18 });
    placed.add(root.id);
  }

  const placeChildren = (parentId: string, startAngle: number, endAngle: number) => {
    const children = (childrenMap.get(parentId) ?? []).filter((childId) => !placed.has(childId));
    if (children.length === 0) return;
    const span = endAngle - startAngle;
    const step = span / children.length;

    children.forEach((childId, index) => {
      const depth = depthMap.get(childId) ?? 1;
      const radius = 0.24 + depth * 0.19;
      const angle = startAngle + step * (index + 0.5);
      const z = Math.sin(angle * 1.1) * 0.08 * (1 - depth / (maxDepth + 1));
      pos.set(childId, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.9,
        z,
      });
      placed.add(childId);
    });

    children.forEach((childId, index) => {
      const childStart = startAngle + step * index;
      const childEnd = startAngle + step * (index + 1);
      placeChildren(childId, childStart, childEnd);
    });
  };

  if (root) {
    placeChildren(root.id, -Math.PI, Math.PI);
  }

  for (const node of tree.nodes) {
    if (placed.has(node.id)) continue;
    const depth = depthMap.get(node.id) ?? 1;
    const angle = (placed.size / Math.max(tree.nodes.length, 1)) * Math.PI * 2;
    const radius = 0.24 + depth * 0.19;
    pos.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.9,
      z: Math.sin(angle) * 0.05,
    });
    placed.add(node.id);
  }

  return tree.nodes.map((node, index) => {
    const p = pos.get(node.id) ?? { x: 0, y: 0, z: 0 };
    const depth = depthMap.get(node.id) ?? 0;
    const depthRatio = depth / maxDepth;
    return {
      id: node.id,
      title: node.title,
      x: clamp(node.x ?? p.x, -0.75, 0.75),
      y: clamp(node.y ?? p.y, -0.65, 0.65),
      z: clamp(node.z ?? p.z, -0.35, 0.35),
      size: node.size ?? (depth === 0 ? 9.5 : 6.8 - depthRatio * 2.4),
      alpha: node.alpha ?? (depth === 0 ? 1 : 0.9 - depthRatio * 0.25),
      speed: node.speed ?? (0.12 + depth * 0.035),
      phase: node.phase ?? index * 0.41,
      parentIds: parentMap.get(node.id) ?? [],
    };
  });
};

type NebulaViewProps = {
  style?: StyleProp<ViewStyle>;
  tree?: NebulaTree;
  showLabels?: boolean;
  interactive?: boolean;
};

export function NebulaView({ style, tree, showLabels = true, interactive = false }: NebulaViewProps) {
  const nebulaTree = useMemo(() => tree ?? defaultTree, [tree]);
  const layoutNodes = useMemo(() => buildLayoutNodes(nebulaTree), [nebulaTree]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [time, setTime] = useState(0);
  const [viewport, setViewport] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewportRef = useRef(viewport);
  const lastTickRef = useRef(0);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      if (t - lastTickRef.current >= 33) {
        lastTickRef.current = t;
        setTime(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const animated = useMemo(() => {
    const nodes = layoutNodes.map((node) => ({ node, p: animateNodePoint(node, time) }));
    const byId = new Map(nodes.map((item) => [item.node.id, item.p] as const));
    return { nodes, byId };
  }, [layoutNodes, time]);

  const projected = useMemo(() => {
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
    const centerX = size.width * 0.5;
    const centerY = size.height * 0.5;
    const out = new Map<string, { x: number; y: number; depth: number; alpha: number; size: number }>();

    for (const { node, p } of animated.nodes) {
      const depth = 1.15 / (1 + p[2] * 0.7);
      const baseX = (((p[0] / aspect) * depth + 1) * 0.5) * size.width;
      const baseY = (1 - (p[1] * depth + 1) * 0.5) * size.height;
      const px = (baseX - centerX) * viewport.scale + centerX + viewport.tx;
      const py = (baseY - centerY) * viewport.scale + centerY + viewport.ty;
      out.set(node.id, {
        x: px,
        y: py,
        depth,
        alpha: Math.max(0.36, Math.min(1, node.alpha * depth)),
        size: Math.max(1.5, node.size * depth * 0.95 * viewport.scale),
      });
    }

    return out;
  }, [animated.nodes, size.height, size.width, viewport.scale, viewport.tx, viewport.ty]);

  const lines = useMemo(() => {
    const edges: Array<{ from: string; to: string; alpha: number }> = [];
    for (const node of layoutNodes) {
      for (const parentId of node.parentIds) {
        edges.push({ from: node.id, to: parentId, alpha: 0.7 });
      }
    }
    return edges;
  }, [layoutNodes]);

  const lineColor = theme.isDark ? "#D1D5DB" : "#0C2A66";
  const pointCore = theme.isDark ? "#F4F7FF" : "#2E5FB3";
  const pointGlow = theme.isDark ? "rgba(212,224,255,0.22)" : "rgba(56,96,173,0.2)";
  const panStart = useRef({ tx: 0, ty: 0 });
  const pinchStart = useRef(1);

  const panGesture = Gesture.Pan()
    .enabled(interactive && Platform.OS !== "web")
    .onBegin(() => {
      panStart.current = { tx: viewportRef.current.tx, ty: viewportRef.current.ty };
    })
    .onUpdate((event) => {
      setViewport((prev) => ({
        ...prev,
        tx: panStart.current.tx + event.translationX,
        ty: panStart.current.ty + event.translationY,
      }));
    });

  const pinchGesture = Gesture.Pinch()
    .enabled(interactive && Platform.OS !== "web")
    .onBegin(() => {
      pinchStart.current = viewportRef.current.scale;
    })
    .onUpdate((event) => {
      setViewport((prev) => ({
        ...prev,
        scale: clamp(pinchStart.current * event.scale, 0.65, 2.6),
      }));
    });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.fill, style]} onLayout={onLayout}>
        {showLabels ? (
          <View style={[StyleSheet.absoluteFillObject, styles.labelsOverlay]}>
            {layoutNodes
              .filter((node) => !!node.title)
              .map((node) => {
                const p = projected.get(node.id);
                if (!p) return null;
                return (
                  <View
                    key={node.id}
                    style={[
                      styles.labelChip,
                      {
                        opacity: p.alpha,
                        transform: [{ translateX: p.x - 22 }, { translateY: p.y - 16 }],
                      },
                    ]}
                  >
                    <Text style={styles.labelText}>{node.title}</Text>
                  </View>
                );
              })}
          </View>
        ) : null}
      </View>
    );
  }

  const content = (
    <View style={[styles.fill, style]} onLayout={onLayout}>
      <Canvas style={StyleSheet.absoluteFillObject}>
        {lines.map((edge) => {
          const from = projected.get(edge.from);
          const to = projected.get(edge.to);
          if (!from || !to) return null;
          const alpha = Math.max(0.24, Math.min(0.92, ((from.alpha + to.alpha) * 0.5) * edge.alpha));
          return (
            <Line
              key={`${edge.from}->${edge.to}`}
              p1={vec(from.x, from.y)}
              p2={vec(to.x, to.y)}
              color={lineColor}
              opacity={alpha}
              strokeWidth={theme.isDark ? 1.1 : 1.35}
            />
          );
        })}

        {animated.nodes.map(({ node }) => {
          const p = projected.get(node.id);
          if (!p) return null;
          return [
            <Circle key={`${node.id}-g`} cx={p.x} cy={p.y} r={p.size * 1.6} color={pointGlow} opacity={p.alpha * 0.5} />,
            <Circle key={`${node.id}-c`} cx={p.x} cy={p.y} r={p.size} color={pointCore} opacity={p.alpha} />,
          ];
        })}
      </Canvas>

      {showLabels ? (
        <View style={[StyleSheet.absoluteFillObject, styles.labelsOverlay]}>
          {layoutNodes
            .filter((node) => !!node.title)
            .map((node) => {
              const p = projected.get(node.id);
              if (!p) return null;
              return (
                <View
                  key={node.id}
                  style={[
                    styles.labelChip,
                    {
                      opacity: p.alpha,
                      transform: [{ translateX: p.x - 22 }, { translateY: p.y - 16 }],
                    },
                  ]}
                >
                  <Text style={styles.labelText}>{node.title}</Text>
                </View>
              );
            })}
        </View>
      ) : null}
    </View>
  );

  if (!interactive) return content;

  return <GestureDetector gesture={gesture}>{content}</GestureDetector>;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.nebula,
    overflow: "hidden",
  },
  labelsOverlay: {
    pointerEvents: "none",
  },
  labelChip: {
    position: "absolute",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.isDark ? "rgba(255,255,255,0.32)" : "rgba(15,23,42,0.2)",
    backgroundColor: theme.isDark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.82)",
  },
  labelText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.isDark ? "#F8FAFC" : "#0F172A",
    ...(Platform.OS === "web"
      ? { textShadow: theme.isDark ? "0 1px 2px rgba(0,0,0,0.75)" : "0 1px 2px rgba(255,255,255,0.9)" }
      : {
          textShadowColor: theme.isDark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.9)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        }),
  },
});

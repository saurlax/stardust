import { GLView } from "expo-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { theme } from "@/components/ui";

type RenderNode = {
  id: string;
  title?: string;
  x: number;
  y: number;
  z: number;
  size?: number;
  alpha?: number;
  speed?: number;
  phase?: number;
  linksTo?: string[];
};

export type NebulaTree = {
  nodes: RenderNode[];
};

const defaultTree: NebulaTree = {
  nodes: Array.from({ length: 28 }, (_, index) => ({
    id: `n-${index}`,
    x: Math.cos((index / 28) * Math.PI * 2) * (0.34 + (index % 5) * 0.05),
    y: Math.sin((index / 28) * Math.PI * 2 * 1.3) * (0.1 + (index % 4) * 0.03),
    z: Math.sin((index / 28) * Math.PI * 2 * 0.75) * (0.15 + (index % 3) * 0.05),
    size: 4.5 + (index % 4) * 1.6,
    alpha: 0.55 + (index % 6) * 0.06,
    speed: 0.16 + (index % 7) * 0.03,
    phase: index * 0.37,
  })),
};

const vertexShaderSource = `
attribute vec3 aPosition;
attribute float aSize;
attribute float aAlpha;

uniform float uAspect;
uniform float uTime;

varying float vAlpha;

void main() {
  vec3 p = aPosition;
  float time = uTime * 0.001;
  float swirl = sin(time * 1.2 + p.z * 6.0) * 0.03;
  p.x += swirl * cos(time + p.y * 4.0);
  p.y += swirl * sin(time * 0.8 + p.x * 4.0);

  float depth = 1.15 / (1.0 + p.z * 0.7);
  vec2 projected = vec2(p.x / uAspect, p.y) * depth;
  gl_Position = vec4(projected, 0.0, 1.0);
  gl_PointSize = max(aSize * depth * 1.35, 1.0);
  vAlpha = aAlpha * clamp(depth, 0.35, 1.0);
}
`;

const pointFragmentShaderSource = theme.isDark
  ? `
precision mediump float;

varying float vAlpha;

void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(offset);
  float glow = smoothstep(0.5, 0.0, distanceFromCenter);
  float core = smoothstep(0.18, 0.0, distanceFromCenter);
  float intensity = mix(glow, core, 0.35);
  gl_FragColor = vec4(vec3(0.97), intensity * vAlpha);
}
`
  : `
precision mediump float;

varying float vAlpha;

void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(offset);
  float glow = smoothstep(0.5, 0.0, distanceFromCenter);
  float core = smoothstep(0.16, 0.0, distanceFromCenter);
  float intensity = mix(glow, core, 0.4);
  gl_FragColor = vec4(vec3(0.35, 0.58, 0.95), intensity * vAlpha);
}
`;

const lineFragmentShaderSource = theme.isDark
  ? `
precision mediump float;

varying float vAlpha;

void main() {
  gl_FragColor = vec4(vec3(0.82), vAlpha * 0.42);
}
`
  : `
precision mediump float;

varying float vAlpha;

void main() {
  gl_FragColor = vec4(vec3(0.25, 0.42, 0.85), vAlpha * 0.26);
}
`;

const createShader = (gl: any, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader.");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "Failed to compile shader.");
  }

  return shader;
};

const createProgram = (gl: any, fragmentSource: string) => {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create program.");

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || "Failed to link program.");
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
};

const rotatePoint = (x: number, y: number, z: number, time: number) => {
  const rotateY = time * 0.00018;
  const rotateX = Math.sin(time * 0.00013) * 0.34;

  const cosY = Math.cos(rotateY);
  const sinY = Math.sin(rotateY);
  const cosX = Math.cos(rotateX);
  const sinX = Math.sin(rotateX);

  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;

  return [x1, y1, z2] as const;
};

const nodePulse = (node: RenderNode, time: number) => {
  const phase = node.phase ?? 0;
  const speed = node.speed ?? 0.2;
  return Math.sin(time * 0.0018 * (0.8 + speed) + phase) * 0.04;
};

const buildNebulaVertices = (tree: NebulaTree, time: number) => {
  const points: number[] = [];
  const lines: number[] = [];
  const idToPoint = new Map<string, readonly [number, number, number]>();

  const center = rotatePoint(0, 0, 0.2 + Math.sin(time * 0.0012) * 0.02, time);
  points.push(center[0], center[1], center[2], 24, 1);

  for (const node of tree.nodes) {
    const pulse = nodePulse(node, time);
    const rotated = rotatePoint(node.x + pulse * 0.5, node.y + pulse * 0.35, node.z + pulse * 0.25, time);
    const alpha = node.alpha ?? 0.7;
    points.push(rotated[0], rotated[1], rotated[2], node.size ?? 6, alpha);
    lines.push(center[0], center[1], center[2], 1.0, alpha * 0.28);
    lines.push(rotated[0], rotated[1], rotated[2], 1.0, alpha * 0.28);
    idToPoint.set(node.id, rotated);
  }

  for (let index = 0; index < tree.nodes.length; index += 1) {
    const node = tree.nodes[index];
    const source = idToPoint.get(node.id);
    if (!source) continue;

    if (node.linksTo && node.linksTo.length > 0) {
      for (const targetId of node.linksTo) {
        const target = idToPoint.get(targetId);
        if (!target) continue;
        lines.push(source[0], source[1], source[2], 1.0, 0.18);
        lines.push(target[0], target[1], target[2], 1.0, 0.18);
      }
      continue;
    }

    if (index > 0) {
      const prev = idToPoint.get(tree.nodes[index - 1].id);
      if (!prev) continue;
      lines.push(prev[0], prev[1], prev[2], 1.0, 0.14);
      lines.push(source[0], source[1], source[2], 1.0, 0.14);
    }
  }

  return {
    points: new Float32Array(points),
    lines: new Float32Array(lines),
    idToPoint,
  };
};

type NebulaViewProps = {
  style?: StyleProp<ViewStyle>;
  tree?: NebulaTree;
  showLabels?: boolean;
};

export function NebulaView({ style, tree, showLabels = true }: NebulaViewProps) {
  const nebulaTree = useMemo(() => tree ?? defaultTree, [tree]);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const labelRefs = useRef<Record<string, View | null>>({});
  const [webLabels, setWebLabels] = useState<Record<string, { x: number; y: number; alpha: number }>>({});

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    sizeRef.current = { width, height };
  };

  return (
    <View style={[styles.fill, style]} onLayout={onLayout}>
      <GLView
        style={StyleSheet.absoluteFillObject}
        onContextCreate={(gl) => {
          try {
            const pointProgram = createProgram(gl, pointFragmentShaderSource);
            const lineProgram = createProgram(gl, lineFragmentShaderSource);
            const pointBuffer = gl.createBuffer();
            const lineBuffer = gl.createBuffer();

            if (!pointBuffer || !lineBuffer) {
              throw new Error("Unable to create buffers.");
            }

            const bindAttributes = (program: any, buffer: any) => {
              gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

              const positionLocation = gl.getAttribLocation(program, "aPosition");
              const sizeLocation = gl.getAttribLocation(program, "aSize");
              const alphaLocation = gl.getAttribLocation(program, "aAlpha");

              gl.enableVertexAttribArray(positionLocation);
              gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
              gl.enableVertexAttribArray(sizeLocation);
              gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 20, 12);
              gl.enableVertexAttribArray(alphaLocation);
              gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, 20, 16);
            };

            const render = (time: number) => {
              const width = gl.drawingBufferWidth;
              const height = gl.drawingBufferHeight;
              const aspect = width / height;
              const { points, lines, idToPoint } = buildNebulaVertices(nebulaTree, time);

              gl.viewport(0, 0, width, height);
              if (theme.isDark) {
                gl.clearColor(0.06, 0.06, 0.07, 1);
              } else {
                gl.clearColor(0.88, 0.93, 1.0, 1);
              }
              gl.clear(gl.COLOR_BUFFER_BIT);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

              gl.useProgram(lineProgram);
              gl.uniform1f(gl.getUniformLocation(lineProgram, "uAspect"), aspect);
              gl.uniform1f(gl.getUniformLocation(lineProgram, "uTime"), time);
              gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
              gl.bufferData(gl.ARRAY_BUFFER, lines, gl.DYNAMIC_DRAW);
              bindAttributes(lineProgram, lineBuffer);
              gl.drawArrays(gl.LINES, 0, lines.length / 5);

              gl.useProgram(pointProgram);
              gl.uniform1f(gl.getUniformLocation(pointProgram, "uAspect"), aspect);
              gl.uniform1f(gl.getUniformLocation(pointProgram, "uTime"), time);
              gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
              gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
              bindAttributes(pointProgram, pointBuffer);
              gl.drawArrays(gl.POINTS, 0, points.length / 5);

              if (showLabels) {
                const viewSize = sizeRef.current;
                if (viewSize.width > 0 && viewSize.height > 0) {
                  const nextWebLabels: Record<string, { x: number; y: number; alpha: number }> = {};
                  for (const node of nebulaTree.nodes) {
                    if (!node.title) continue;
                    const ref = labelRefs.current[node.id];
                    const p = idToPoint.get(node.id);
                    if (!p) continue;
                    const depth = 1.15 / (1.0 + p[2] * 0.7);
                    const px = (((p[0] / aspect) * depth + 1) * 0.5) * viewSize.width;
                    const py = ((1 - (p[1] * depth + 1) * 0.5) * viewSize.height) - 16;
                    const alpha = Math.max(0.35, Math.min(1, (node.alpha ?? 0.7) * depth));
                    if (Platform.OS === "web") {
                      nextWebLabels[node.id] = { x: px - 20, y: py, alpha };
                      continue;
                    }
                    if (ref && typeof (ref as any).setNativeProps === "function") {
                      ref.setNativeProps({
                        style: {
                          opacity: alpha,
                          transform: [{ translateX: px - 20 }, { translateY: py }],
                        },
                      });
                    }
                  }
                  if (Platform.OS === "web") {
                    setWebLabels(nextWebLabels);
                  }
                }
              }

              gl.endFrameEXP();
              rafRef.current = requestAnimationFrame(render);
            };

            render(0);
          } catch {
            if (theme.isDark) {
              gl.clearColor(0.08, 0.08, 0.08, 1);
            } else {
              gl.clearColor(0.93, 0.96, 1.0, 1);
            }
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.endFrameEXP();
          }
        }}
      />

      {showLabels ? (
        <View style={[StyleSheet.absoluteFillObject, styles.labelsOverlay]}>
          {nebulaTree.nodes
            .filter((node) => !!node.title)
            .map((node) => (
            <View
              key={node.id}
              ref={(ref) => {
                labelRefs.current[node.id] = ref;
              }}
              style={[
                styles.labelChip,
                Platform.OS === "web" && webLabels[node.id]
                  ? {
                      opacity: webLabels[node.id].alpha,
                      transform: [
                        { translateX: webLabels[node.id].x },
                        { translateY: webLabels[node.id].y },
                      ],
                    }
                  : null,
              ]}
            >
              <Text style={styles.labelText}>{node.title}</Text>
            </View>
          ))}
        </View>
      ) : null}

    </View>
  );
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
    transform: [{ translateX: -20 }],
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

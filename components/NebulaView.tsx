import { GLView } from "expo-gl";
import { useEffect, useRef } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type NebulaNode = {
  angle: number;
  radius: number;
  height: number;
  depth: number;
  size: number;
  alpha: number;
  speed: number;
  phase: number;
};

const nebulaNodes: NebulaNode[] = Array.from({ length: 28 }, (_, index) => ({
  angle: (index / 28) * Math.PI * 2,
  radius: 0.34 + (index % 5) * 0.05,
  height: 0.1 + (index % 4) * 0.03,
  depth: 0.15 + (index % 3) * 0.05,
  size: 4.5 + (index % 4) * 1.6,
  alpha: 0.55 + (index % 6) * 0.06,
  speed: 0.16 + (index % 7) * 0.03,
  phase: index * 0.37,
}));

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

const pointFragmentShaderSource = `
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
`;

const lineFragmentShaderSource = `
precision mediump float;

varying float vAlpha;

void main() {
  gl_FragColor = vec4(vec3(0.82), vAlpha * 0.42);
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

const buildNebulaVertices = (time: number) => {
  const points: number[] = [];
  const lines: number[] = [];
  const center = rotatePoint(0, 0, 0.2 + Math.sin(time * 0.0012) * 0.02, time);

  points.push(center[0], center[1], center[2], 24, 1);

  let previous = center;

  nebulaNodes.forEach((node) => {
    const orbit = node.angle + time * 0.0004 * node.speed;
    const pulse = Math.sin(time * 0.0018 + node.phase) * 0.04;
    const radius = node.radius + pulse;
    const x = Math.cos(orbit) * radius;
    const y = Math.sin(orbit * 1.3 + node.phase) * node.height;
    const z = Math.sin(orbit * 0.75 + node.phase) * node.depth;
    const rotated = rotatePoint(x, y, z, time);

    points.push(rotated[0], rotated[1], rotated[2], node.size, node.alpha);

    lines.push(center[0], center[1], center[2], 1.0, node.alpha * 0.32);
    lines.push(rotated[0], rotated[1], rotated[2], 1.0, node.alpha * 0.32);

    lines.push(previous[0], previous[1], previous[2], 1.0, node.alpha * 0.16);
    lines.push(rotated[0], rotated[1], rotated[2], 1.0, node.alpha * 0.16);

    previous = rotated;
  });

  return {
    points: new Float32Array(points),
    lines: new Float32Array(lines),
  };
};

type NebulaViewProps = {
  style?: StyleProp<ViewStyle>;
};

export function NebulaView({ style }: NebulaViewProps) {
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  return (
    <GLView
      style={[styles.fill, style]}
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
            const { points, lines } = buildNebulaVertices(time);

            gl.viewport(0, 0, width, height);
            gl.clearColor(0.06, 0.06, 0.07, 1);
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
            gl.uniform1f(
              gl.getUniformLocation(pointProgram, "uAspect"),
              aspect,
            );
            gl.uniform1f(gl.getUniformLocation(pointProgram, "uTime"), time);
            gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
            bindAttributes(pointProgram, pointBuffer);
            gl.drawArrays(gl.POINTS, 0, points.length / 5);

            gl.endFrameEXP();
            rafRef.current = requestAnimationFrame(render);
          };

          render(0);
        } catch {
          gl.clearColor(0.08, 0.08, 0.08, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.endFrameEXP();
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#111111",
  },
});

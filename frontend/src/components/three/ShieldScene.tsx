"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

function shieldShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.15);
  s.bezierCurveTo(0.55, 1.05, 0.95, 0.85, 1.05, 0.35);
  s.lineTo(1.05, -0.15);
  s.bezierCurveTo(1.0, -0.75, 0.55, -1.15, 0, -1.35);
  s.bezierCurveTo(-0.55, -1.15, -1.0, -0.75, -1.05, -0.15);
  s.lineTo(-1.05, 0.35);
  s.bezierCurveTo(-0.95, 0.85, -0.55, 1.05, 0, 1.15);
  return s;
}

function ForgeShield({
  progress,
  settled,
}: {
  progress: number;
  settled: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const wire = useRef<THREE.LineSegments>(null);

  const geo = useMemo(() => {
    const shape = shieldShape();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 3,
      curveSegments: 24,
    });
    g.center();
    return g;
  }, []);

  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 18), [geo]);

  useFrame((_, dt) => {
    if (!group.current) return;
    const targetScale = settled ? 1.35 : 0.35 + progress * 0.95;
    const cur = group.current.scale.x;
    const next = THREE.MathUtils.lerp(cur, targetScale, settled ? 0.04 : 0.12);
    group.current.scale.setScalar(next);
    group.current.rotation.y += dt * (settled ? 0.12 : 0.35);
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      settled ? 0.18 : 0.05,
      0.05,
    );
    if (mat.current) {
      mat.current.opacity = settled
        ? 0.22
        : Math.min(1, progress * 1.2);
      mat.current.emissiveIntensity = settled ? 0.35 : 0.55 + progress * 0.6;
    }
    if (wire.current) {
      const wm = wire.current.material as THREE.LineBasicMaterial;
      wm.opacity = settled ? 0.45 : 0.25 + progress * 0.75;
    }
  });

  return (
    <Float speed={settled ? 0.8 : 1.4} rotationIntensity={0.15} floatIntensity={0.35}>
      <group ref={group} scale={0.2}>
        <mesh geometry={geo}>
          <meshStandardMaterial
            ref={mat}
            color="#1e6fff"
            emissive="#4d8fff"
            emissiveIntensity={0.6}
            metalness={0.85}
            roughness={0.25}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
        <lineSegments ref={wire} geometry={edges}>
          <lineBasicMaterial color="#8eb6ff" transparent opacity={0.7} />
        </lineSegments>
      </group>
    </Float>
  );
}

function OrbitDust({ active }: { active: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const n = 120;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1.6 + (i % 5) * 0.12;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = Math.sin(a * 1.7) * 0.55;
      arr[i * 3 + 2] = Math.sin(a) * r * 0.35;
    }
    return arr;
  }, []);

  useFrame((_, dt) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y += dt * 0.08;
  });

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial
        size={0.035}
        color="#4d8fff"
        transparent
        opacity={active ? 0.55 : 0}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export function ShieldScene({
  progress,
  settled,
}: {
  progress: number;
  settled: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      frameloop="always"
    >
      <color attach="background" args={["transparent"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} color="#cfe0ff" />
      <pointLight position={[-2, -1, 2]} intensity={1.4} color="#1e6fff" />
      <ForgeShield progress={progress} settled={settled} />
      <OrbitDust active={settled} />
    </Canvas>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { GameMonitorProps } from "@/games/types";
import { CUBE_HALF, GOAL, OBSTACLE, PLATFORM_HALF, type Cube3dState } from "@/games/cube3d/logic";

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cubes: Map<string, THREE.Mesh>;
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Escena mínima de Three.js: una plataforma, un obstáculo, una meta y un
 * cubo por jugador. Materiales sin iluminación (MeshBasicMaterial): el color
 * se ve siempre igual sin depender de calibrar luces (ver README sección 19,
 * "evitar iluminación compleja") y sin riesgo de que la escena se vea negra
 * por falta de luz.
 */
export function Cube3dMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const cube3d = state as Cube3dState | null;
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!isWebGLAvailable()) {
      queueMicrotask(() => setWebglError(true));
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#18181b");

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 8, 7);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      queueMicrotask(() => setWebglError(true));
      return;
    }
    container.appendChild(renderer.domElement);

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_HALF * 2, 0.2, PLATFORM_HALF * 2),
      new THREE.MeshBasicMaterial({ color: "#3f3f46" })
    );
    platform.position.y = -0.1;
    scene.add(platform);

    const platformEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(platform.geometry),
      new THREE.LineBasicMaterial({ color: "#71717a" })
    );
    platformEdges.position.copy(platform.position);
    scene.add(platformEdges);

    const obstacle = new THREE.Mesh(
      new THREE.BoxGeometry(OBSTACLE.halfW * 2, 0.6, OBSTACLE.halfD * 2),
      new THREE.MeshBasicMaterial({ color: "#71717a" })
    );
    obstacle.position.set(OBSTACLE.x, 0.3, OBSTACLE.z);
    scene.add(obstacle);

    const goal = new THREE.Mesh(
      new THREE.CylinderGeometry(GOAL.r, GOAL.r, 0.05, 32),
      new THREE.MeshBasicMaterial({ color: "#3ECF8E" })
    );
    goal.position.set(GOAL.x, 0.02, GOAL.z);
    scene.add(goal);

    refs.current = { renderer, scene, camera, cubes: new Map() };

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      refs.current?.cubes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      platform.geometry.dispose();
      (platform.material as THREE.Material).dispose();
      platformEdges.geometry.dispose();
      (platformEdges.material as THREE.Material).dispose();
      obstacle.geometry.dispose();
      (obstacle.material as THREE.Material).dispose();
      goal.geometry.dispose();
      (goal.material as THREE.Material).dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, []);

  useEffect(() => {
    const current = refs.current;
    if (!current || !cube3d) return;

    for (const player of cube3d.players) {
      let mesh = current.cubes.get(player.id);
      if (!mesh) {
        const color = players.find((p) => p.id === player.id)?.color ?? "#5B8CFF";
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(CUBE_HALF * 2, CUBE_HALF * 2, CUBE_HALF * 2),
          new THREE.MeshBasicMaterial({ color })
        );
        current.scene.add(mesh);
        current.cubes.set(player.id, mesh);
      }
      mesh.position.set(player.x, CUBE_HALF, player.z);
    }

    current.renderer.render(current.scene, current.camera);
  }, [cube3d, players]);

  if (!cube3d) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">Cubo de equilibrio</p>
        <p className="text-2xl font-mono tabular-nums">{Math.ceil(cube3d.remainingMs / 1000)}s</p>
      </div>
      <div className="relative w-full flex-1" style={{ aspectRatio: "16 / 10" }}>
        {webglError ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-surface text-center px-6 text-muted">
            Este dispositivo no soporta gráficos 3D (WebGL). Prueba con otro navegador o
            dispositivo.
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0 overflow-hidden rounded-2xl" />
        )}
      </div>
    </div>
  );
}

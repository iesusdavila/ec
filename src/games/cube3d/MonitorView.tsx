"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GameMonitorProps } from "@/games/types";
import { CUBE_HALF, GOAL, OBSTACLE, PLATFORM_HALF, type Cube3dState } from "@/games/cube3d/logic";

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cubes: Map<string, THREE.Mesh>;
}

/**
 * Escena mínima de Three.js: una plataforma, un obstáculo, una meta y un
 * cubo por jugador. Sin sombras, sin texturas, sin post-procesado: el
 * objetivo de este juego es validar la integración 3D + sensores, no
 * demostrar gráficos avanzados (ver README sección 19).
 */
export function Cube3dMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const cube3d = state as Cube3dState | null;
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111113");

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 9, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(4, 8, 4);
    scene.add(directional);

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_HALF * 2, 0.2, PLATFORM_HALF * 2),
      new THREE.MeshStandardMaterial({ color: "#27272a" })
    );
    platform.position.y = -0.1;
    scene.add(platform);

    const obstacle = new THREE.Mesh(
      new THREE.BoxGeometry(OBSTACLE.halfW * 2, 0.6, OBSTACLE.halfD * 2),
      new THREE.MeshStandardMaterial({ color: "#3f3f46" })
    );
    obstacle.position.set(OBSTACLE.x, 0.3, OBSTACLE.z);
    scene.add(obstacle);

    const goal = new THREE.Mesh(
      new THREE.CylinderGeometry(GOAL.r, GOAL.r, 0.05, 32),
      new THREE.MeshStandardMaterial({ color: "#3ECF8E" })
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
          new THREE.MeshStandardMaterial({ color })
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
      <div ref={containerRef} className="flex-1 w-full rounded-2xl overflow-hidden" />
    </div>
  );
}

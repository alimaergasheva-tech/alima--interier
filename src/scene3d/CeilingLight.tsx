import { useUiStore } from '../store/uiStore';

/** Параметры потолочного светильника (SPEC D-11): значения в одном месте для сцены, тестов и замеров. */
export const CEILING_LIGHT = {
  /** Сила точечного света, кд; в комнате ~4×3,5 м даёт читаемый, но не дневной свет. */
  intensity: 38,
  color: '#ffd9a8',
  /** Радиус плафона, м. */
  shadeRadius: 0.16,
  /** Длина подвеса от потолка до центра плафона, м. */
  drop: 0.22,
} as const;

/** Положение источника под потолком, м. */
export function ceilingLightY(ceilingHeightM: number): number {
  return ceilingHeightM - CEILING_LIGHT.drop;
}

/**
 * Стандартный подвесной светильник по центру комнаты. Включённость берётся из выключателя комнаты;
 * в комнате без записи светильник выключен. Тени не отбрасывает (D-08: число теней ограничено).
 */
export function CeilingLight({ roomId, center, ceilingHeightM, emitLight = true, hidden = false }: {
  roomId: string; center: [number, number]; ceilingHeightM: number;
  /** false в прогулке: источники выдаёт общий набор WalkLights с ограничением числа. */
  emitLight?: boolean;
  /** true, если в комнате стоит люстра или плафон: стандартный светильник убран (SPEC D-14). */
  hidden?: boolean;
}) {
  const on = useUiStore((state) => state.roomLights[roomId] === true);
  const y = ceilingLightY(ceilingHeightM);
  if (hidden) return null;
  return (
    <group position={[center[0], 0, center[1]]} name="ceiling-light">
      <mesh position={[0, ceilingHeightM - 0.02, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 20]} />
        <meshStandardMaterial color="#e8e6e1" roughness={0.6} />
      </mesh>
      <mesh position={[0, (ceilingHeightM + y) / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, CEILING_LIGHT.drop, 8]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.7} />
      </mesh>
      <mesh position={[0, y, 0]}>
        <sphereGeometry args={[CEILING_LIGHT.shadeRadius, 24, 16]} />
        <meshStandardMaterial color="#f3efe8" roughness={0.5}
          emissive={on ? CEILING_LIGHT.color : '#000000'} emissiveIntensity={on ? 2.2 : 0} />
      </mesh>
      {on && emitLight && <pointLight position={[0, y - 0.05, 0]} color={CEILING_LIGHT.color} intensity={CEILING_LIGHT.intensity} distance={0} decay={2} />}
    </group>
  );
}

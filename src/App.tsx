import { Canvas } from '@react-three/fiber';
import { useHistoryHotkeys } from './ui/useHistoryHotkeys';

// Каркас этапа 2: подтверждает, что интерфейс и 3D-зависимости работают вместе.
// Рабочие экраны появляются с этапа 4.
export function App() {
  useHistoryHotkeys();
  return (
    <div className="app-shell">
      <header className="app-bar">
        <h1 className="app-title">Планировщик интерьера</h1>
        <span className="app-stage">Каркас приложения</span>
      </header>
      <main className="app-main">
        <Canvas data-testid="scene-canvas" camera={{ position: [3, 2.4, 4], fov: 45 }}>
          <color attach="background" args={['#14161a']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 3]} intensity={2} />
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#8fa3b8" />
          </mesh>
          <gridHelper args={[10, 10, '#3a404b', '#262a32']} />
        </Canvas>
      </main>
    </div>
  );
}

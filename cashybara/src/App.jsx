import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CapybaraModel } from './component/capybara';

function App() {
  const handleStartClick = () => {
    window.location.href = '/home.html';
  }
  return (
    <div className="app-container">
      <h1 className="app-title">Welcome to CasHyBara...</h1>
      <button className="start-button" onClick={handleStartClick}>Start</button>
      <Canvas camera={{ position: [0, 2, 6], fov: 50 }}>
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 5, 5]} angle={0.3} intensity={1.2} castShadow />
        <spotLight position={[2, 5, 2]} angle={0.3} intensity={1.2} />
        <React.Suspense fallback={null}>
          <CapybaraModel scale={0.8} position={[0, -1, 0]} />
        </React.Suspense>
        <CameraController />
      </Canvas>
    </div>
  );
}

function CameraController() {
  const { camera, mouse } = useThree();
  const targetX = useRef(camera.position.x);

  useFrame(() => {
    const maxOffset = 2;
    const newX = mouse.x * maxOffset;

    targetX.current += (newX - targetX.current) * 0.05;
    camera.position.x = targetX.current;

    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default App;
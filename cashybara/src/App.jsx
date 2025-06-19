import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CapybaraModel } from './component/capybara';

function App() {
  const handleStartClick = () => {
    window.location.href = '/home.html';
  }
  return (
    <div className="app-container">
      <h1 className="app-title">Welcome to CasHyBara</h1>
      <button className="start-button" onClick={handleStartClick}>Start</button>
      <Canvas camera={{ position: [0, 1, 3], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 2, 2]} />
        <React.Suspense fallback={null}>
          <CapybaraModel scale={1.5} position={[0, -1, 0]} />
        </React.Suspense>
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default App;
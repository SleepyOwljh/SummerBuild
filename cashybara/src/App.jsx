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
      <Canvas camera={{ position: [0, 2, 6], fov: 50 }}>
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 5, 5]} angle={0.3} intensity={1.2} castShadow />
        <spotLight position={[2, 5, 2]} angle={0.3} intensity={1.2} />
        <React.Suspense fallback={null}>
          <CapybaraModel scale={0.8} position={[0, -1, 0]} />
        </React.Suspense>
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default App;
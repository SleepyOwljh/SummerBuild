import React, { useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';

export function CapybaraModel(props) {
    const { scene, animations } = useGLTF('/model/quill_-_capybara.glb');
    const { actions } = useAnimations(animations, scene);

    useEffect(() => {
        if (actions && animations.length > 0) {
            actions[animations[0].name]?.play();
        }
    }, [actions, animations]);

    return <primitive object={scene} {...props} />;
}

useGLTF.preload('/model/quill_-_capybara.glb');
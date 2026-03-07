import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import LightPillar from './LightPillar';

const AuthLayout = () => {
    const location = useLocation();

    return (
        <div className="auth-layout" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            background: '#000',
            overflow: 'hidden'
        }}>
            <LightPillar
                topColor="#d946ef"
                bottomColor="#020617"
                intensity={0.8}
                quality="high"
                pillarWidth={2.0}
                pillarHeight={0.6}
                pillarRotation={35}
            />

            <AnimatePresence mode="wait">
                <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, x: 20, filter: 'blur(5px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -20, filter: 'blur(5px)' }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        position: 'relative',
                        zIndex: 10
                    }}
                >
                    <Outlet />
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default AuthLayout;

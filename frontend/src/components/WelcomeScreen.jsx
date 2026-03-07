import React, { useEffect, useState } from 'react';
import ShinyText from './ShinyText';
import { motion } from 'motion/react';

const WelcomeScreen = ({ email, onComplete }) => {
    const [greeting, setGreeting] = useState('');
    const [name, setName] = useState('');

    useEffect(() => {
        // Extract name from email (e.g. majestic.s@email.com -> Majestic)
        if (email) {
            const extractedName = email.split('@')[0].split('.')[0]; // Handle dots too
            const formattedName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1);
            setName(formattedName);
        }

        // Determine greeting based on time of day (24h format)
        // 5–11:59 -> Good Morning
        // 12–17:59 -> Good Afternoon
        // 18–4:59 -> Good Evening
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            setGreeting('Good Morning');
        } else if (hour >= 12 && hour < 18) {
            setGreeting('Good Afternoon');
        } else {
            setGreeting('Good Evening');
        }

        // Auto-redirect after 2 seconds (1.8-2s requested)
        const timer = setTimeout(() => {
            onComplete();
        }, 2000);

        return () => clearTimeout(timer);
    }, [email, onComplete]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                position: 'fixed', // Fixed to cover screen
                top: 0,
                left: 0,
                zIndex: 50,
                padding: '1rem' // Prevent edge touching on small screens
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)', // Safari support
                    borderRadius: '24px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '3rem 2.5rem',
                    width: '100%',
                    maxWidth: '520px', // 480-560px requested
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(124, 58, 237, 0.15)', // Soft shadow + glow
                    textAlign: 'center',
                    color: '#ffffff'
                }}
            >
                <div style={{
                    marginBottom: '1rem',
                    fontFamily: '"Playfair Display", serif',
                    fontSize: '2.5rem',
                    fontWeight: '700',
                    lineHeight: '1.2',
                    letterSpacing: '-0.01em',
                    textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}>
                    {greeting}, {name}
                </div>

                <div style={{
                    fontSize: '1.1rem',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontWeight: '400',
                    letterSpacing: '0.02em'
                }}>
                    Let’s personalize your nutrition experience.
                </div>
            </motion.div>
        </motion.div>
    );
};

export default WelcomeScreen;

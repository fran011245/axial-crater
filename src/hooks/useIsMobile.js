"use client";

import { useState, useEffect } from 'react';

/**
 * Hook para detectar si el dispositivo es mobile o tablet
 * @returns {Object} { isMobile: boolean, isTablet: boolean }
 */
export const useIsMobile = () => {
    // Inicializar con false para SSR (server-side rendering)
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        // Marcar que estamos en el cliente
        setIsClient(true);
        
        // Solo ejecutar en el cliente
        if (typeof window === 'undefined') return;

        const checkSize = () => {
            const width = window.innerWidth;
            setIsMobile(width < 768);
            setIsTablet(width >= 768 && width < 1024);
        };

        // Verificar tamaño inicial
        checkSize();

        // Escuchar cambios de tamaño
        window.addEventListener('resize', checkSize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', checkSize);
        };
    }, []);

    // Durante SSR, retornar false para evitar errores
    if (!isClient) {
        return { isMobile: false, isTablet: false };
    }

    return { isMobile, isTablet };
};


"use client";

import React, { useState, useEffect, useRef } from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const RGL = require('react-grid-layout');

// Get the Responsive component
const Responsive = RGL.Responsive || RGL.ResponsiveGridLayout || RGL.default?.Responsive;

export default function DraggableGrid({ children, ...props }) {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(1200);

    // Auto-detect container width for responsive behavior
    useEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = () => {
            if (containerRef.current) {
                setWidth(containerRef.current.offsetWidth);
            }
        };

        // Initial measurement
        updateWidth();

        // Update on resize
        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, []);

    if (!Responsive) {
        return <div style={{ color: 'red' }}>Error: RGL Component Not Found</div>;
    }

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
            <Responsive
                {...props}
                width={width}
                useCSSTransforms={true}
                compactType="vertical"
                preventCollision={false}
            >
                {children}
            </Responsive>
        </div>
    );
}

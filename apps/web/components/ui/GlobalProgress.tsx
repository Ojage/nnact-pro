import React, { useEffect, useRef, useState } from 'react';
import NProgress from 'nprogress';
import { loadingStore } from '../../lib/loadingStore';

export const GlobalProgress: React.FC = () => {
    const [isLoading, setIsLoading] = useState(loadingStore.isLoading);
    const configuredRef = useRef(false);

    useEffect(() => {
        const unsubscribe = loadingStore.subscribe(setIsLoading);
        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!configuredRef.current) {
            NProgress.configure({
                showSpinner: false,
                trickle: true,
                trickleSpeed: 200,
                minimum: 0.08,
            });
            configuredRef.current = true;
        }
    }, []);

    useEffect(() => {
        if (isLoading) {
            NProgress.start();
            return;
        }

        // Ensure we fully complete the bar when loading ends.
        NProgress.done(true);
    }, [isLoading]);

    return null;
};

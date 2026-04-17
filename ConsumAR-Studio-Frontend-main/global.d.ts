import * as React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & ModelViewerAttributes,
        HTMLElement
      >;
    }
  }
}

interface ModelViewerAttributes {
  src?: string;
  alt?: string;
  poster?: string;
  'ios-src'?: string;
  'seamless-poster'?: boolean;
  loading?: 'auto' | 'lazy' | 'eager';
  reveal?: 'auto' | 'interaction' | 'manual';
  'with-credentials'?: boolean;

  // AR
  ar?: boolean;
  'ar-modes'?: string;
  'ar-scale'?: 'auto' | 'fixed';
  'ar-placement'?: 'floor' | 'wall';
  'xr-environment'?: boolean;

  // Staging & camera control
  'camera-controls'?: boolean;
  'disable-zoom'?: boolean;
  'touch-action'?: string;
  'camera-orbit'?: string;
  'camera-target'?: string;
  'field-of-view'?: string;
  'max-camera-orbit'?: string;
  'min-camera-orbit'?: string;
  'max-field-of-view'?: string;
  'min-field-of-view'?: string;
  'interaction-prompt'?: 'auto' | 'when-focused' | 'none';
  'interaction-prompt-style'?: 'basic' | 'wiggle';
  'interaction-prompt-threshold'?: string;
  'orbit-sensitivity'?: string;
  'zoom-sensitivity'?: string;
  'pan-sensitivity'?: string;

  // Lighting & environment
  'skybox-image'?: string;
  'environment-image'?: string;
  'exposure'?: string;
  'shadow-intensity'?: string;
  'shadow-softness'?: string;
  'tone-mapping'?: 'auto' | 'commerce' | 'neutral';

  // Animation
  autoplay?: boolean;
  'animation-name'?: string;
  'animation-crossfade-duration'?: string;

  // Materials & scene
  'variant-name'?: string;
  orientation?: string;
  scale?: string;

  // Dimensions
  bounds?: 'tight' | 'legacy';
  'disable-tap'?: boolean;
  'quick-look-browsers'?: string;

  // Event handlers
  onLoad?: (event: Event) => void;
  onError?: (event: ErrorEvent) => void;
  onProgress?: (event: ProgressEvent) => void;
  onCameraChange?: (event: Event) => void;
  onModelVisibility?: (event: Event) => void;

  // Ref
  ref?: React.Ref<any>;
}

declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

export {};

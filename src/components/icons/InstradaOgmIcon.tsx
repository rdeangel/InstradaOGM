
'use client';
import React, { useState } from 'react';
import type { ImgHTMLAttributes, SVGProps } from 'react';
import { ClientOnly } from '@/components/util/ClientOnly';
import Image from 'next/image';

// Define size variants for responsive logo sizing
type LogoSize = 'small' | 'medium' | 'large' | number;

interface InstradaOgmIconProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> {
  size?: LogoSize;
  width?: number | string;
  height?: number | string;
}

export function InstradaOgmIcon(props: InstradaOgmIconProps | SVGProps<SVGSVGElement>) {
  // Type guard to check if props are for an image
  const isImgProps = (p: unknown): p is InstradaOgmIconProps => typeof p === 'object' && p !== null && ('src' in p || !('viewBox' in p));

  const imgProps = isImgProps(props) ? props : ({} as InstradaOgmIconProps);
  const { width, height, size = 'medium', ...restProps } = imgProps;
  const [imageError, setImageError] = useState(false);

  const handleError = () => {
    setImageError(true);
  };

  // Convert size to CSS dimensions that respond to browser zoom
  const getSizeDimensions = (sizeValue: LogoSize, fallbackWidth?: number | string, fallbackHeight?: number | string) => {
    // If explicit width/height provided, use them but make them zoom-responsive
    if (fallbackWidth && fallbackHeight) {
      const widthNum = typeof fallbackWidth === 'string' ? Number(fallbackWidth) : fallbackWidth;
      const heightNum = typeof fallbackHeight === 'string' ? Number(fallbackHeight) : fallbackHeight;
      const safeWidth = Number.isFinite(widthNum) ? widthNum : 40;
      const safeHeight = Number.isFinite(heightNum) ? heightNum : 40;

      // Convert pixels to rem for zoom responsiveness (16px = 1rem typically)
      return {
        width: `${safeWidth / 16}rem`,
        height: `${safeHeight / 16}rem`,
        pixelWidth: safeWidth,
        pixelHeight: safeHeight
      };
    }

    // Use predefined size variants
    if (typeof sizeValue === 'number') {
      return {
        width: `${sizeValue / 16}rem`,
        height: `${sizeValue / 16}rem`,
        pixelWidth: sizeValue,
        pixelHeight: sizeValue
      };
    }

    // Predefined size variants (in pixels, converted to rem)
    const sizeMap = {
      small: { px: 40, rem: 2.5 },    // 40px = 2.5rem
      medium: { px: 50, rem: 3.125 }, // 50px = 3.125rem
      large: { px: 56, rem: 3.5 }     // 56px = 3.5rem
    };

    // eslint-disable-next-line security/detect-object-injection
    const selectedSize = sizeMap[sizeValue];
    return {
      width: `${selectedSize.rem}rem`,
      height: `${selectedSize.rem}rem`,
      pixelWidth: selectedSize.px,
      pixelHeight: selectedSize.px
    };
  };

  const dimensions = getSizeDimensions(size, width, height);

  if (imageError) {
    return (
      <ClientOnly fallback={<div style={{ width: dimensions.width, height: dimensions.height, backgroundColor: 'hsl(var(--muted))', borderRadius: '9999px' }} />}>
        <svg
          style={{ width: dimensions.width, height: dimensions.height }}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          {...(restProps as SVGProps<SVGSVGElement>)}
        >
          <circle cx="100" cy="100" r="90" fill="#007bff" />
          <path d="M100 40 C70 40 50 60 50 100 C50 140 70 160 100 160 C130 160 150 140 150 100 C150 60 130 40 100 40 Z M100 60 C120 60 130 75 130 100 C130 125 120 140 100 140 C80 140 70 125 70 100 C70 75 80 60 100 60 Z" fill="white" />
        </svg>
      </ClientOnly>
    );
  }

  // If SVG props, render SVG directly
  if (!isImgProps(props)) {
    const svgProps = props as SVGProps<SVGSVGElement>;
    const { className: svgClassName, ...svgRestProps } = svgProps;
    return (
      <ClientOnly fallback={<div className={svgClassName} style={{ width: dimensions.width, height: dimensions.height, backgroundColor: 'hsl(var(--muted))', borderRadius: '9999px' }} />}>
        <svg className={svgClassName} style={{ width: dimensions.width, height: dimensions.height }} {...svgRestProps} />
      </ClientOnly>
    );
  }

  // Remove size, width, height, className from restProps to avoid passing them to Image
  const imgRestProps = Object.fromEntries(
    Object.entries(restProps).filter(
      ([key]) => !['size', 'width', 'height', 'className'].includes(key)
    )
  ) as Omit<InstradaOgmIconProps, 'size' | 'width' | 'height' | 'className'>;

  return (
    <ClientOnly fallback={<div className={imgProps.className} style={{ width: dimensions.width, height: dimensions.height, backgroundColor: 'hsl(var(--muted))', borderRadius: '9999px' }} />}>
      <div
        className={imgProps.className}
        style={{ width: dimensions.width, height: dimensions.height, position: 'relative' }}
      >
        <Image
          src="/images/InstradaOGM-logo.svg"
          alt={imgProps.alt || 'InstradaOGM Logo'}
          fill
          style={{ objectFit: 'contain' }}
          onError={handleError}
          {...imgRestProps}
        />
      </div>
    </ClientOnly>
  );
}

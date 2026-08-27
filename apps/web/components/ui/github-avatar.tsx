import { forwardRef, useMemo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';
import { cn } from './utils';
import React from 'react';

export interface GitHubAvatarProps
  extends Omit<React.ComponentProps<typeof Avatar>, 'title'> {
  name?: string;
  src?: string;
  size?: number | string;
  alt?: string;
  square?: boolean;
  variant?: 'default' | 'subtle' | 'vibrant';
}

const DEFAULT_SIZE = 40;
const GRID_SIZE = 5; // GitHub uses 5x5 grid

const generateGitHubIdenticon = (seed: string, size: number = GRID_SIZE): string[] => {
  // Simple deterministic hash for GitHub-like pattern
  const hash = Array.from(seed).reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0);
  }, 0);
  
  const pattern: string[] = [];
  const colorHash = Math.abs(hash) % 360;
  
  // Generate 5x5 symmetric pattern (GitHub style)
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < Math.ceil(size / 2); x++) {
      const pixelHash = (hash + x + y * size) % 2;
      row += pixelHash ? '1' : '0';
    }
    // Mirror the pattern for symmetry
    const mirrored = row + row.split('').reverse().slice(1).join('');
    pattern.push(mirrored);
  }
  
  return pattern;
};

const getGitHubColors = (seed: string): [string, string] => {
  const hash = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // GitHub's typical identicon color palette ranges
  const colors = [
    ['#FF6B6B', '#FFE66D'], // Red/Yellow
    ['#4ECDC4', '#556270'], // Teal/Gray
    ['#C44D58', '#FF6B6B'], // Pink/Red
    ['#45B7D1', '#96CEB4'], // Blue/Green
    ['#FECA57', '#FF9F43'], // Orange/Yellow
    ['#54A0FF', '#5F27CD'], // Blue/Purple
    ['#00D2D3', '#FF9FF3'], // Cyan/Pink
    ['#FF9F43', '#EE5A24'], // Orange/Dark Orange
  ];
  
  const selected = colors[Math.abs(hash) % colors.length];
  return selected.length === 2 ? [selected[0], selected[1]] : ['#CCCCCC', '#888888'];
};

const getGitHubInitials = (value?: string): string => {
  if (!value) return '';
  
  const parts = value.trim().split(/[_\-\s]+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase();
};

const GitHubIdenticon = ({ seed, size = 40 }: { seed: string; size: number }) => {
  const pattern = useMemo(() => generateGitHubIdenticon(seed), [seed]);
  const [bgColor, fgColor] = useMemo(() => getGitHubColors(seed), [seed]);
  const cellSize = size / GRID_SIZE;
  
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
      className="rounded"
    >
      {/* Background */}
      <rect width={GRID_SIZE} height={GRID_SIZE} fill={bgColor} />
      
      {/* Pattern */}
      {pattern.map((row, y) => {
        return row.split('').map((cell, x) => {
          if (cell === '1') {
            return (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill={fgColor}
              />
            );
          }
          return null;
        });
      })}
    </svg>
  );
};

export const GitHubAvatar = forwardRef<HTMLDivElement, GitHubAvatarProps>(
  ({ 
    name = 'github', 
    src, 
    size = DEFAULT_SIZE, 
    className, 
    alt, 
    style,
    square = true,
    variant = 'default',
    ...props 
  }, ref) => {
    const initials = useMemo(() => getGitHubInitials(name), [name]);
    const identiconSeed = name || 'github';
    
    const sizeNum = typeof size === 'string' ? parseInt(size, 10) || DEFAULT_SIZE : size;
    
    const avatarStyle = useMemo(() => {
      const baseStyle: React.CSSProperties = {
        width: size,
        height: size,
        borderRadius: square ? '6px' : '50%',
        ...style,
      };
      
      if (!src) {
        const [bgColor] = getGitHubColors(identiconSeed);
        baseStyle.backgroundColor = bgColor;
      }
      
      return baseStyle;
    }, [size, square, style, src, identiconSeed]);

    return (
      <Avatar
        ref={ref}
        className={cn(
          'overflow-hidden border border-[--color-border-muted]',
          'shadow-xs hover:shadow-sm transition-shadow',
          className
        )}
        style={avatarStyle}
        {...props}
      >
        {src ? (
          <AvatarImage
            src={src}
            alt={alt ?? name ?? 'GitHub Avatar'}
            className={cn(
              'object-cover',
              square ? 'rounded' : 'rounded-full'
            )}
          />
        ) : (
          <>
            {/* Identicon for non-image avatars */}
            <div className="absolute inset-0">
              <GitHubIdenticon seed={identiconSeed} size={sizeNum} />
            </div>
            
            {/* Initials overlay */}
            {initials && sizeNum > 24 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn(
                  "font-semibold text-white mix-blend-overlay",
                  sizeNum <= 32 ? "text-xs" : 
                  sizeNum <= 48 ? "text-sm" : 
                  "text-base"
                )}>
                  {initials}
                </span>
              </div>
            )}
            
            <AvatarFallback className="opacity-0">
              {initials}
            </AvatarFallback>
          </>
        )}
      </Avatar>
    );
  }
);

GitHubAvatar.displayName = 'GitHubAvatar';

// Additional GitHub-like avatar components
export const GitHubOrgAvatar = forwardRef<HTMLDivElement, GitHubAvatarProps>(
  (props, ref) => {
    return (
      <GitHubAvatar
        ref={ref}
        {...props}
        className={cn(
          'ring-2 ring-[--color-canvas-default]',
          props.className
        )}
      />
    );
  }
);

export const GitHubUserAvatar = forwardRef<HTMLDivElement, GitHubAvatarProps>(
  (props, ref) => {
    return (
      <GitHubAvatar
        ref={ref}
        square={false}
        {...props}
        className={cn(
          'hover:ring-2 hover:ring-[--color-accent-emphasis] transition-all',
          props.className
        )}
      />
    );
  }
);

// GitHub-style avatar group
interface GitHubAvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  size?: number;
  className?: string;
}

export const GitHubAvatarGroup = ({ 
  children, 
  max = 5, 
  size = 32,
  className 
}: GitHubAvatarGroupProps) => {
  const childrenArray = React.Children.toArray(children);
  const visibleChildren = childrenArray.slice(0, max);
  const remaining = childrenArray.length - max;
  
  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {visibleChildren.map((child, index) => (
        <div 
          key={index}
          className="ring-2 ring-[--color-canvas-default] rounded overflow-hidden"
          style={{ zIndex: visibleChildren.length - index }}
        >
          {React.isValidElement(child) 
            ? React.cloneElement(child as React.ReactElement<any>, { 
                size,
                square: false 
              })
            : child
          }
        </div>
      ))}
      
      {remaining > 0 && (
        <div 
          className="flex items-center justify-center ring-2 ring-[--color-canvas-default] bg-[--color-neutral-muted] rounded-full text-xs font-medium text-[--color-fg-muted]"
          style={{ 
            width: size, 
            height: size,
            zIndex: visibleChildren.length 
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
};
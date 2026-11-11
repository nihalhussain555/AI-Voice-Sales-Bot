import React from 'react';
import { cn } from '../../lib/cn.js';

// Every page wraps itself in this so the content width, gutters and the vertical
// rhythm stay identical across the console.
export default function Page({ children, className }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8', className)}>
      {children}
    </div>
  );
}

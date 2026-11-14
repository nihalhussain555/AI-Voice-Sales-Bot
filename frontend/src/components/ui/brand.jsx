import React from 'react';

import { cn } from '../../lib/cn.js';
import markDark from '../../assets/brand/mark.png';
import markLight from '../../assets/brand/mark-on-light.png';
import wordDark from '../../assets/brand/wordmark.png';
import wordLight from '../../assets/brand/wordmark-on-light.png';

// The supplied logo is white artwork on a dark ground, so the light canvas needs
// its own treatment of the same art. index.css picks one of the pair through
// [data-theme], which means the swap costs nothing when the theme toggles. The
// hidden half is display:none, so it leaves the accessibility tree and both
// halves can carry the same label.
const MARK = { sm: 'h-8', md: 'h-9', lg: 'h-11' };
const WORD = { sm: 'h-[17px]', md: 'h-5', lg: 'h-6' };

export function BrandMark({ size = 'md', labelled = true, className }) {
  const box = MARK[size] || MARK.md;
  const alt = labelled ? 'VoicePitch AI' : '';
  return (
    <>
      <img src={markDark} alt={alt} draggable="false"
        className={cn('brand-art shrink-0 w-auto object-contain', box, className)} />
      <img src={markLight} alt={alt} draggable="false"
        className={cn('brand-art-on-light shrink-0 w-auto object-contain', box, className)} />
    </>
  );
}

// The wordmark spells out the brand name, so it takes the label and any mark
// rendered next to it goes decorative. It sizes from its own aspect ratio and
// only shrinks, never stretches, when the header runs out of room.
export function BrandWordmark({ size = 'md', className }) {
  const box = WORD[size] || WORD.md;
  return (
    <span className={cn('block min-w-0', className)}>
      <img src={wordDark} alt="VoicePitch AI" draggable="false"
        className={cn('brand-art w-auto max-w-full object-contain object-left', box)} />
      <img src={wordLight} alt="VoicePitch AI" draggable="false"
        className={cn('brand-art-on-light w-auto max-w-full object-contain object-left', box)} />
    </span>
  );
}

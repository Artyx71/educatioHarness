import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownRenderer from '../src/components/MarkdownRenderer';

describe('learning markdown', () => {
  it('renders inline and display math with KaTeX', () => {
    const html = renderToStaticMarkup(<MarkdownRenderer>{'Площадь: $A=\\pi r^2$\n\n$$\n\\int_0^1 x\\,dx=\\frac12\n$$'}</MarkdownRenderer>);
    expect(html).toContain('katex');
    expect(html).toContain('katex-display');
    expect(html).toContain('Площадь:');
  });
});

import { describe, expect, it } from 'vitest';
import { sniffImage } from './assets.js';

describe('sniffImage', () => {
  it('recognises PNG, JPEG and WebP by their first bytes', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('image/png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
  });

  it('refuses SVG, other files and short data', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImage(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

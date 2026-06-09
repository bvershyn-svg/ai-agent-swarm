import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@swarm/shared', 'react-markdown', 'remark-gfm', 'remark-parse', 'unified', 'bail', 'is-plain-obj', 'trough', 'vfile', 'vfile-message', 'unist-util-stringify-position', 'mdast-util-from-markdown', 'mdast-util-to-string', 'micromark'],
};

export default nextConfig;

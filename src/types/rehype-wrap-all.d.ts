// src/types/rehype-wrap-all.d.ts
declare module 'rehype-wrap-all' {
  import { Plugin } from 'unified';

  export interface WrapOptions {
    selector?: string;
    wrapper?: string;
  }

  const wrapAll: Plugin<[WrapOptions] | WrapOptions[]>;
  export default wrapAll;
}

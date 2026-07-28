import type { Adapter } from '../types';
import { saplingAdapter } from './sapling';
import { gowinstonAdapter } from './gowinston';
import { pangramAdapter } from './pangram';
import { copyleaksAdapter } from './copyleaks';
import { walterwritesAdapter } from './walterwrites';
import { gptzeroAdapter } from './gptzero';
import { originalityAdapter } from './originality';
import { grammarlyAdapter } from './grammarly';
import { ryneAdapter } from './ryne';

export const ADAPTERS: Adapter[] = [
  saplingAdapter,
  gowinstonAdapter,
  pangramAdapter,
  copyleaksAdapter,
  walterwritesAdapter,
  gptzeroAdapter,
  originalityAdapter,
  grammarlyAdapter,
  ryneAdapter,
];

export function getAdapter(key: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.key === key);
}

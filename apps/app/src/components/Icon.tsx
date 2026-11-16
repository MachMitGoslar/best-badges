import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Feather-Icons wie im MachMit!Haus-System (Strichstärke ist bei Feather fest). */
export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color, label }: { name: IconName; size?: number; color?: string; label?: string }) {
  return <Feather name={name} size={size} color={color} accessibilityLabel={label} accessible={!!label} />;
}

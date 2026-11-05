import { Heart, Lightbulb, Mail, MapPin, MessageSquare, MoreHorizontal, Phone, StickyNote, Users, type LucideIcon } from 'lucide-react';
import type { ActivityType } from '@/types/activity';
export const ICONS: Record<ActivityType, LucideIcon> = { call: Phone, meeting: Users, visit: MapPin, email: Mail, message: MessageSquare, consult: Lightbulb, care: Heart, note: StickyNote, other: MoreHorizontal };

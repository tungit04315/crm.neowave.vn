import { useAuth } from '@/contexts/AuthContext';
import { deleteActivity } from '@/lib/activities';
import type { Activity } from '@/types/activity';

/** Sales chỉ sửa/xóa tương tác do mình tạo; quản lý trở lên sửa được tất cả (Firestore Rules cũng kiểm tra điều này). */
export function useActivityActions(reload: () => void) {
  const { profile } = useAuth();
  const canEdit = (a: Activity) => !!profile && (a.createdBy === profile.uid || ['super_admin', 'director', 'manager'].includes(profile.role));
  const remove = async (a: Activity) => { if (confirm(`Xóa tương tác “${a.title}”?`)) { try { await deleteActivity(a.id); reload(); } catch { alert('Không xóa được tương tác.'); } } };
  return { canEdit, remove };
}

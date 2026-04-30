import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const ROLE_LABELS = {
  super_admin: { label: '超级管理员', color: 'bg-red-100 text-red-800' },
  ops_admin: { label: '运维管理员', color: 'bg-blue-100 text-blue-800' },
  readonly: { label: '审计员', color: 'bg-purple-100 text-purple-800' },
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'ops_admin' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editUsername, setEditUsername] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data.users);
    } catch (err) {
      setError(err.response?.data?.error || '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    try {
      await api.post('/auth/users', createForm);
      setShowCreate(false);
      setCreateForm({ username: '', password: '', role: 'ops_admin' });
      fetchUsers();
    } catch (err) {
      setCreateError(err.response?.data?.error || err.response?.data?.errors?.map(e => e.msg).join(', ') || '创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/auth/users/${userId}/role`, { role: newRole });
      setEditingRole(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || '角色更新失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/auth/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword) return;
    setResetError('');
    setResetLoading(true);
    try {
      await api.put(`/auth/users/${resetTarget.id}/reset-password`, { newPassword: resetPassword });
      setResetTarget(null);
      setResetPassword('');
      alert(`用户 ${resetTarget.username} 的密码已重置`);
    } catch (err) {
      setResetError(err.response?.data?.error || err.response?.data?.errors?.map(e => e.msg).join(', ') || '重置失败');
    } finally {
      setResetLoading(false);
    }
  };

  const handleEditUsername = async () => {
    if (!editTarget || !editUsername) return;
    try {
      await api.put(`/auth/users/${editTarget.id}/info`, { username: editUsername });
      setEditTarget(null);
      setEditUsername('');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || '修改失败');
    }
  };

  // Filter users that current user can manage (superadmin can only manage ops_admin and readonly)
  const manageableUsers = users.filter(u => u.role !== 'super_admin' || u.id === currentUser?.id);

  if (loading) return <div className="p-6">加载中...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">用户管理</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          {showCreate ? '取消' : '创建用户'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {/* Create User Form */}
      {showCreate && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-3">创建新用户</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="用户名（至少3个字符）"
                value={createForm.username}
                onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                className="border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                required
                minLength={3}
              />
              <input
                type="password"
                placeholder="密码（至少8位，含大小写+数字）"
                value={createForm.password}
                onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                className="border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                required
                minLength={8}
              />
              <select
                value={createForm.role}
                onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                className="border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="ops_admin">运维管理员</option>
                <option value="readonly">审计员</option>
              </select>
            </div>
            {createError && (
              <div className="text-red-600 text-sm">{createError}</div>
            )}
            <button
              type="submit"
              disabled={createLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {createLoading ? '创建中...' : '确认创建'}
            </button>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">用户名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {manageableUsers.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 text-sm font-medium">
                  {u.username}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-gray-400">（当前用户）</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  {editingRole === u.id ? (
                    <select
                      defaultValue={u.role}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                      onBlur={() => setEditingRole(null)}
                      className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
                      autoFocus
                    >
                      <option value="ops_admin">运维管理员</option>
                      <option value="readonly">审计员</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${ROLE_LABELS[u.role]?.color || 'bg-gray-100 text-gray-800'} ${u.id !== currentUser?.id && u.role !== 'super_admin' ? 'cursor-pointer' : ''}`}
                      onClick={() => u.id !== currentUser?.id && u.role !== 'super_admin' && setEditingRole(u.id)}
                      title={u.id !== currentUser?.id && u.role !== 'super_admin' ? '点击修改角色' : ''}
                    >
                      {ROLE_LABELS[u.role]?.label || u.role}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {u.created_at}
                </td>
                <td className="px-6 py-4 text-sm space-x-3">
                  {u.id !== currentUser?.id && u.role !== 'super_admin' && (
                    <>
                      <button
                        onClick={() => { setResetTarget(u); setResetPassword(''); setResetError(''); }}
                        className="text-primary-600 hover:text-primary-800"
                      >
                        重置密码
                      </button>
                      <button
                        onClick={() => { setEditTarget(u); setEditUsername(u.username); }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="text-red-600 hover:text-red-800"
                      >
                        删除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role Description */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-3">角色权限说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 border rounded dark:border-gray-600">
            <div className="font-semibold text-red-600 mb-1">超级管理员 (superadmin)</div>
            <ul className="text-gray-600 dark:text-gray-400 space-y-1">
              <li>- 除审计日志外的全部功能</li>
              <li>- 管理运维管理员和审计员</li>
              <li>- 重置运维管理员和审计员密码</li>
              <li>- 备份恢复、系统设置</li>
            </ul>
          </div>
          <div className="p-3 border rounded dark:border-gray-600">
            <div className="font-semibold text-blue-600 mb-1">运维管理员 (admin)</div>
            <ul className="text-gray-600 dark:text-gray-400 space-y-1">
              <li>- 除审计日志外的全部功能</li>
              <li>- Zone/记录增删改</li>
              <li>- 系统设置、告警管理</li>
              <li>- 不能管理其他用户</li>
            </ul>
          </div>
          <div className="p-3 border rounded dark:border-gray-600">
            <div className="font-semibold text-purple-600 mb-1">审计员 (aadmin)</div>
            <ul className="text-gray-600 dark:text-gray-400 space-y-1">
              <li>- 仅可查看审计日志</li>
              <li>- 审计日志导出和验证</li>
              <li>- 无任何修改权限</li>
              <li>- 无权访问其他功能</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Reset Password Dialog */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">重置密码 — {resetTarget.username}</h3>
            <input
              type="password"
              placeholder="新密码（至少8位，含大小写+数字）"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-3 dark:bg-gray-700 dark:border-gray-600"
              minLength={8}
              autoFocus
            />
            {resetError && <div className="text-red-600 text-sm mb-3">{resetError}</div>}
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setResetTarget(null); setResetPassword(''); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">取消</button>
              <button
                onClick={handleResetPassword}
                disabled={resetLoading || resetPassword.length < 8}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {resetLoading ? '重置中...' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Username Dialog */}
      {editTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">编辑用户 — {editTarget.username}</h3>
            <input
              type="text"
              placeholder="新用户名"
              value={editUsername}
              onChange={e => setEditUsername(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-3 dark:bg-gray-700 dark:border-gray-600"
              minLength={3}
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setEditTarget(null); setEditUsername(''); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">取消</button>
              <button
                onClick={handleEditUsername}
                disabled={editUsername.length < 3}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="删除用户"
          message={`确定要删除用户 "${deleteTarget.username}" 吗？此操作不可撤销。`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

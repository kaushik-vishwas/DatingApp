import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-100">
      <AdminSidebar />
      <main className="min-h-screen flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

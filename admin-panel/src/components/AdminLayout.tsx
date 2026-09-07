import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminNotificationBell } from './AdminNotificationBell';

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-100">
      <AdminSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-end border-b border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur">
          <AdminNotificationBell />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

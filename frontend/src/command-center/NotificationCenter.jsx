import { BellRing, CheckCheck, ExternalLink, X } from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function NotificationCenter() {
  const store = useCommandCenter();
  if (!store.notificationsOpen) return null;
  const notifications = Object.values(store.notifications).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <aside className="notification-panel" aria-label="Notifications">
      <header><span><BellRing size={18} /><strong>Notifications</strong></span><button type="button" aria-label="Close notifications" onClick={store.toggleNotifications}><X size={17} /></button></header>
      {'Notification' in window && Notification.permission === 'default' && <button type="button" className="browser-notification-button" onClick={store.enableBrowserNotifications}>Enable critical browser alerts</button>}
      <div className="notification-list">
        {!notifications.length && <p className="empty-state">No operational notifications.</p>}
        {notifications.map((notification) => <article key={notification.notificationId} className={`${notification.read ? 'read' : 'unread'} severity-${notification.severity?.toLowerCase()}`}><button type="button" className="notification-main" onClick={() => store.openNotification(notification)}><span><strong>{notification.title}</strong><small>{relativeTime(notification.createdAt)}</small></span><p>{notification.message}</p>{(notification.incidentId || notification.resourceId) && <em><ExternalLink size={12} /> Open {notification.incidentId ?? notification.resourceId}</em>}</button>{!notification.read && <button type="button" className="mark-read" aria-label="Mark read" onClick={() => store.markNotificationRead(notification.notificationId)}><CheckCheck size={15} /></button>}</article>)}
      </div>
    </aside>
  );
}

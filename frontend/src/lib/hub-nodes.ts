import type { LucideIcon } from "lucide-react";
import {
  Bug,
  ScrollText,
  ListTodo,
  BarChart3,
  Users,
  KeyRound,
  LogIn,
  Newspaper,
  ShieldAlert,
  UsersRound,
  History,
} from "lucide-react";

export type HubNodeDef = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  requiresAuth?: boolean;
  adminOnly?: boolean;
  /** Single permission required */
  permission?: string;
  /** Any of these permissions grants access (OR) */
  anyPermission?: string[];
};

/** Free side */
export const FREE_NODES: HubNodeDef[] = [
  { id: "tips", label: "نصائح وأخبار", href: "/news", icon: Newspaper },
  { id: "virus", label: "فحص الفيروسات", href: "/virus", icon: Bug },
  {
    id: "tickets-public",
    label: "بلاغ أمني",
    href: "/tickets",
    icon: ShieldAlert,
  },
];

export const LOGIN_NODE: HubNodeDef = {
  id: "login",
  label: "تسجيل الدخول",
  href: "/login",
  icon: LogIn,
};

export const AUTH_NODES: HubNodeDef[] = [
  {
    id: "activity",
    label: "سجل العمليات",
    href: "/activity",
    icon: History,
    requiresAuth: true,
    permission: "activity.read",
  },
  {
    id: "logs",
    label: "تحليل السجلات",
    href: "/logs",
    icon: ScrollText,
    requiresAuth: true,
    anyPermission: ["logs.analyze", "logs.read"],
  },
  {
    id: "tasks",
    label: "المهام",
    href: "/tasks",
    icon: ListTodo,
    requiresAuth: true,
    anyPermission: ["tasks.view_all", "tasks.view_own", "tasks.view_group"],
  },
  {
    id: "tickets",
    label: "إدارة البلاغات",
    href: "/tickets?manage=1",
    icon: ShieldAlert,
    requiresAuth: true,
    permission: "tickets.read",
  },
  {
    id: "task-groups",
    label: "مجموعات المهام",
    href: "/task-groups",
    icon: UsersRound,
    requiresAuth: true,
    permission: "tasks.groups.manage",
  },
  {
    id: "performance",
    label: "الأداء",
    href: "/performance",
    icon: BarChart3,
    requiresAuth: true,
    permission: "performance.read",
  },
  {
    id: "users",
    label: "المستخدمون",
    href: "/users",
    icon: Users,
    requiresAuth: true,
    adminOnly: true,
  },
  {
    id: "permissions",
    label: "الصلاحيات",
    href: "/permissions",
    icon: KeyRound,
    requiresAuth: true,
    permission: "roles.manage",
  },
];

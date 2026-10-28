"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

type Props = {
  children: React.ReactNode;
  /** Require login only */
  loginOnly?: boolean;
  /** User must have ALL of these */
  permissions?: string[];
  /** User must have ANY of these (OR) */
  anyPermission?: string[];
  /** Admin role required */
  adminOnly?: boolean;
  title?: string;
};

export function RequireAccess({
  children,
  loginOnly = false,
  permissions = [],
  anyPermission = [],
  adminOnly = false,
  title = "هذه الصفحة محمية",
}: Props) {
  const { user, loading, hasPermission, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="loader-ring" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="display text-2xl">{title}</h1>
        <p className="mt-2 text-[var(--fg-muted)]">يجب تسجيل الدخول للمتابعة.</p>
        <Link href="/login" className="mt-6 inline-block">
          <Button>دخول</Button>
        </Link>
      </div>
    );
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="display text-2xl">صلاحية غير كافية</h1>
        <p className="mt-2 text-[var(--fg-muted)]">هذه الصفحة للمسؤولين فقط.</p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="secondary">العودة</Button>
        </Link>
      </div>
    );
  }

  if (!loginOnly) {
    const missingAll =
      permissions.length > 0 && !permissions.every((p) => hasPermission(p));
    const missingAny =
      anyPermission.length > 0 && !anyPermission.some((p) => hasPermission(p));
    if (missingAll || missingAny) {
      return (
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="display text-2xl">صلاحية غير كافية</h1>
          <p className="mt-2 text-[var(--fg-muted)]">
            ليس لديك صلاحية لعرض هذه الصفحة.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="secondary">العودة</Button>
          </Link>
        </div>
      );
    }
  }

  return <>{children}</>;
}

"use client";

import { Suspense } from "react";
import TicketsPageInner from "./TicketsInner";

export default function TicketsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="loader-ring" />
        </div>
      }
    >
      <TicketsPageInner />
    </Suspense>
  );
}

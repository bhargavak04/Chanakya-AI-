"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

/** Chanakya logo - uses light fill (silver/white) for dark backgrounds via invert filter */
export function Logo({ className, size = 24 }: LogoProps) {
  return (
    <Image
      src="/logo.svg"
      alt="Chanakya"
      width={size}
      height={size * (544 / 1024)}
      className={cn("flex-shrink-0 opacity-90", className)}
      style={{ filter: "invert(1) brightness(0.95)" }}
    />
  );
}

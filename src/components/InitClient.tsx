'use client';

import { useEffect } from 'react';

export default function InitClient() {
  useEffect(() => {
    fetch('/api/init').catch(() => {});
  }, []);
  return null;
}

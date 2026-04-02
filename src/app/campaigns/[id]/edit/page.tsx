'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    const message = encodeURIComponent(`Edit the campaign with ID ${id} — show me what I can change.`);
    router.push(`/chat?prefill=${message}`);
  }, [id, router]);

  return <div className="text-gray-500 text-center py-12">Redirecting to AI Chat...</div>;
}

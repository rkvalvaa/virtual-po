import { RequestQueue } from '@/components/requests/RequestQueue';
import type { QueueParams } from '@/lib/db/queries/request-queue';

export default function ReviewQueuePage({ searchParams }: { searchParams: Promise<QueueParams> }) {
  return <RequestQueue queue="review" searchParams={searchParams} />;
}

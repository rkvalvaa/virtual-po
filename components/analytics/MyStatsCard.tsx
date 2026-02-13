import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UserDashboardStats } from '@/lib/db/queries/analytics'

interface MyStatsCardProps {
  stats: UserDashboardStats
}

export function MyStatsCard({ stats }: MyStatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">My Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs font-medium">My Requests</p>
            <p className="text-2xl font-bold">{stats.myRequestsCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium">Pending</p>
            <p className="text-2xl font-bold">{stats.myPendingCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium">Completed</p>
            <p className="text-2xl font-bold">{stats.myCompletedCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium">My Votes</p>
            <p className="text-2xl font-bold">{stats.myVotesCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

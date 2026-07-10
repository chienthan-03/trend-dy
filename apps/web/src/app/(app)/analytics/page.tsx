import { PageHeader, Card } from "@/components/ui";

const AnalyticsPage = () => (
  <div className="space-y-6">
    <PageHeader
      title="Analytics"
      description="Token usage and AI cost tracking."
    />
    <Card>
      <p className="text-sm text-gray-600">
        Usage analytics and daily AI budget guard ship in Task 15 (
        <code className="rounded bg-gray-100 px-1">GET /analytics/usage</code>
        ).
      </p>
    </Card>
  </div>
);

export default AnalyticsPage;

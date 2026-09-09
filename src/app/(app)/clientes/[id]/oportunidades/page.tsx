import { notFound } from "next/navigation";
import { getCustomer360 } from "@/services/customer-service";
import { listCustomerOpportunitiesWithContext } from "@/services/journey-opportunity-service";
import { hasPermission } from "@/lib/permissions";
import { AppError } from "@/lib/app-error";
import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Oportunidades da cliente" };

export default async function CustomerOpportunitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { customer, context } = await getCustomer360(id);
    const opportunities = await listCustomerOpportunitiesWithContext(context, id);
    const canManage = hasPermission(context.role, "opportunity:manage");
    return <div className="space-y-5">
      <CustomerHeader customer={customer} />
      <CustomerTabs customerId={customer.id} active="opportunities" />
      <div><h2 className="text-lg font-bold">Oportunidades desta cliente</h2><p className="mt-1 text-sm text-slate-500">Eventos de jornada convertidos em decisões operacionais explicáveis.</p></div>
      {opportunities.length === 0 ? <Card className="p-5"><p className="font-semibold">Nenhuma oportunidade no momento.</p><p className="mt-1 text-sm text-slate-500">A jornada continua sendo acompanhada sem criar recomendações artificiais.</p></Card> : <div className="space-y-3">{opportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} canManage={canManage} />)}</div>}
    </div>;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

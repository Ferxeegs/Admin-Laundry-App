import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import OrdersList from "./OrdersList";

export default function Orders() {
  return (
    <>
      <PageMeta
        title="Orders"
        description="Manage all laundry orders in the system"
      />
      <PageBreadcrumb pageTitle="Orders" />
      <div className="space-y-6">
        <ComponentCard title="Daftar Orders">
          <OrdersList />
        </ComponentCard>
      </div>
    </>
  );
}


